import "server-only";

import {
  AnnouncementStatus,
  AnnouncementTargetType,
  AuditAction,
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  Prisma,
  Role,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AnnouncementOperationError } from "@/services/announcements/errors";
import {
  announcementCreateSchema,
  announcementUpdateSchema,
  type AnnouncementListQuery,
} from "@/services/announcements/schemas";
import {
  announcementViewSelect,
  findAnnouncementById,
  loadAnnouncementPage,
  type AnnouncementViewRecord,
} from "@/services/announcements/repository";
import type {
  AnnouncementListResult,
  AnnouncementPublishResult,
  AnnouncementView,
} from "@/services/announcements/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeAnnouncementAuditLog } from "@/services/audit/repository";
import type {
  AuditConfigSnapshot,
  AuditRequestContext,
} from "@/services/audit/types";
import { notificationDeduplication } from "@/services/notifications/deduplication";
import { createRoleNotifications } from "@/services/notifications/service";
import { systemAnnouncementTemplate } from "@/services/notifications/templates";

const SERIALIZABLE_RETRY_LIMIT = 2;

function userView(user: AnnouncementViewRecord["createdBy"]) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.profile?.displayName ?? user.email,
  };
}

function announcementView(record: AnnouncementViewRecord): AnnouncementView {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    targetType: record.targetType,
    status: record.status,
    publishedAt: record.publishedAt,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdBy: userView(record.createdBy),
    publishedBy: record.publishedBy ? userView(record.publishedBy) : null,
  };
}

function auditSnapshot(record: {
  title: string;
  content: string;
  targetType: AnnouncementTargetType;
  status: AnnouncementStatus;
  expiresAt: Date | null;
}): AuditConfigSnapshot {
  return {
    title: record.title,
    contentLength: record.content.length,
    targetType: record.targetType,
    status: record.status,
    expiresAt: record.expiresAt?.toISOString() ?? null,
  };
}

function rolesForTarget(target: AnnouncementTargetType): Role[] | undefined {
  if (target === AnnouncementTargetType.ALL) return undefined;
  return [Role[target]];
}

function assertValidExpiry(
  expiresAt: Date | null | undefined,
  now: Date,
): void {
  if (expiresAt && expiresAt <= now) {
    throw new AnnouncementOperationError("公告过期时间必须晚于当前时间", 422);
  }
}

async function serializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (retryable && attempt < SERIALIZABLE_RETRY_LIMIT) continue;
      throw error;
    }
  }
  throw new AnnouncementOperationError("公告操作发生并发冲突，请重试", 409);
}

export async function listAnnouncements(
  query: AnnouncementListQuery,
): Promise<AnnouncementListResult> {
  const { total, records } = await loadAnnouncementPage(query);
  return {
    items: records.map(announcementView),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getAnnouncement(id: string): Promise<AnnouncementView> {
  const record = await findAnnouncementById(id);
  if (!record) throw new ResourceNotFoundError("公告不存在");
  return announcementView(record);
}

export async function createAnnouncement(
  actorId: string,
  rawInput: unknown,
  context: AuditRequestContext,
  now = new Date(),
): Promise<AnnouncementView> {
  const input = announcementCreateSchema.parse(rawInput);
  assertValidExpiry(input.expiresAt, now);
  return serializableTransaction(async (transaction) => {
    const record = await transaction.announcement.create({
      data: {
        title: input.title,
        content: input.content,
        targetType: input.targetType,
        expiresAt: input.expiresAt ?? null,
        createdById: actorId,
      },
      select: announcementViewSelect,
    });
    await writeAnnouncementAuditLog(transaction, {
      actorId,
      action: AuditAction.ANNOUNCEMENT_CREATED,
      targetId: record.id,
      summary: `创建公告草稿：${record.title}`,
      beforeData: null,
      afterData: auditSnapshot(record),
      context,
    });
    return announcementView(record);
  });
}

export async function updateAnnouncement(
  actorId: string,
  id: string,
  rawInput: unknown,
  context: AuditRequestContext,
  now = new Date(),
): Promise<AnnouncementView> {
  const input = announcementUpdateSchema.parse(rawInput);
  assertValidExpiry(input.expiresAt, now);
  return serializableTransaction(async (transaction) => {
    const before = await findAnnouncementById(id, transaction);
    if (!before) throw new ResourceNotFoundError("公告不存在");
    if (before.status !== AnnouncementStatus.DRAFT) {
      throw new AnnouncementOperationError("已发布公告不能修改", 409);
    }
    const after = await transaction.announcement.update({
      where: { id },
      data: input,
      select: announcementViewSelect,
    });
    await writeAnnouncementAuditLog(transaction, {
      actorId,
      action: AuditAction.ANNOUNCEMENT_UPDATED,
      targetId: id,
      summary: `更新公告草稿：${after.title}`,
      beforeData: auditSnapshot(before),
      afterData: auditSnapshot(after),
      context,
    });
    return announcementView(after);
  });
}

export async function publishAnnouncement(
  actorId: string,
  id: string,
  context: AuditRequestContext,
  now = new Date(),
): Promise<AnnouncementPublishResult> {
  return serializableTransaction(async (transaction) => {
    const before = await findAnnouncementById(id, transaction);
    if (!before) throw new ResourceNotFoundError("公告不存在");
    if (before.status === AnnouncementStatus.PUBLISHED) {
      return {
        announcement: announcementView(before),
        createdNotificationCount: 0,
        alreadyPublished: true,
      };
    }
    assertValidExpiry(before.expiresAt, now);
    const after = await transaction.announcement.update({
      where: { id },
      data: {
        status: AnnouncementStatus.PUBLISHED,
        publishedAt: now,
        publishedById: actorId,
      },
      select: announcementViewSelect,
    });
    const rendered = systemAnnouncementTemplate(after);
    const notifications = await createRoleNotifications(
      rolesForTarget(after.targetType),
      {
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        ...rendered,
        priority: NotificationPriority.IMPORTANT,
        actionUrl: "/notifications",
        sourceType: NotificationSourceType.ANNOUNCEMENT,
        sourceId: after.id,
        deduplicationKey: notificationDeduplication.systemAnnouncement(
          after.id,
        ),
        expiresAt: after.expiresAt,
      },
      transaction,
    );
    await writeAnnouncementAuditLog(transaction, {
      actorId,
      action: AuditAction.ANNOUNCEMENT_PUBLISHED,
      targetId: id,
      summary: `发布系统公告：${after.title}`,
      beforeData: auditSnapshot(before),
      afterData: auditSnapshot(after),
      context,
    });
    return {
      announcement: announcementView(after),
      createdNotificationCount: notifications.createdCount,
      alreadyPublished: false,
    };
  });
}
