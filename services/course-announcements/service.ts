import "server-only";

import { randomUUID } from "node:crypto";

import {
  AnnouncementStatus,
  AnnouncementTargetType,
  AuditAction,
  ClassroomStatus,
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AnnouncementOperationError } from "@/services/announcements/errors";
import { serializableTransaction } from "@/services/announcements/service";
import { writeAnnouncementAuditLog } from "@/services/audit/repository";
import type {
  AuditConfigSnapshot,
  AuditRequestContext,
} from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  countClassroomAudience,
  findCourseAnnouncementById,
  findTeacherCourse,
  findTeacherCourseClassroom,
  listAnnouncementsByBatch,
  listClassroomStudentIds,
  loadClassroomAudienceCounts,
  loadCourseAnnouncementPage,
  courseAnnouncementSelect,
  loadReadCounts,
  type CourseAnnouncementRecord,
} from "@/services/course-announcements/repository";
import {
  courseAnnouncementCreateSchema,
  courseAnnouncementUpdateSchema,
  type CourseAnnouncementAudienceQuery,
  type CourseAnnouncementBatchInput,
  type CourseAnnouncementListQuery,
} from "@/services/course-announcements/schemas";
import type {
  CourseAnnouncementAudience,
  CourseAnnouncementBatchResult,
  CourseAnnouncementCreateResult,
  CourseAnnouncementListResult,
  CourseAnnouncementPublishResult,
  CourseAnnouncementView,
} from "@/services/course-announcements/types";
import { notificationDeduplication } from "@/services/notifications/deduplication";
import { createNotifications } from "@/services/notifications/service";
import { courseAnnouncementTemplate } from "@/services/notifications/templates";

const DAY_MS = 24 * 60 * 60 * 1_000;
/** 单教师单班 24 小时内最多发布的课程通知条数。 */
const PUBLISH_LIMIT_PER_WINDOW = 3;
/** 频控与重复内容检测共用同一时间窗。 */
const WINDOW_MS = DAY_MS;

function classroomView(record: CourseAnnouncementRecord) {
  if (!record.classroom) {
    throw new AnnouncementOperationError("课程通知缺少目标班级", 400);
  }
  return { id: record.classroom.id, name: record.classroom.name };
}

function toView(
  record: CourseAnnouncementRecord,
  audienceCount: number,
  readCount: number,
  batchClassrooms: Array<{ id: string; name: string }> = [],
): CourseAnnouncementView {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    status: record.status,
    classroom: classroomView(record),
    batchId: record.batchId,
    batchClassrooms,
    audienceCount,
    readCount,
    publishedAt: record.publishedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function auditSnapshot(record: CourseAnnouncementRecord): AuditConfigSnapshot {
  return {
    title: record.title,
    contentLength: record.content.length,
    classroomId: record.classroom?.id ?? null,
    status: record.status,
    expiresAt: record.expiresAt?.toISOString() ?? null,
  };
}

/**
 * 有效期按「天数」换算为绝对时间；null / 0 表示不自动过期。
 * 用服务器时间计算，避免前端时区导致偏差。
 */
function resolveExpiry(
  expiresInDays: number | null | undefined,
  now: Date,
): Date | null {
  if (expiresInDays === null || expiresInDays === undefined) return null;
  if (expiresInDays <= 0) return null;
  return new Date(now.getTime() + expiresInDays * DAY_MS);
}

function assertValidExpiry(expiresAt: Date | null, now: Date): void {
  if (expiresAt && expiresAt <= now) {
    throw new AnnouncementOperationError("有效期必须晚于当前时间", 422);
  }
}

function assertClassroomActive(classroom: {
  status: ClassroomStatus;
  name: string;
}): void {
  if (classroom.status !== ClassroomStatus.ACTIVE) {
    throw new AnnouncementOperationError(
      `班级「${classroom.name}」已结束，不能再发布通知`,
      409,
      "CLASSROOM_INACTIVE",
    );
  }
}

async function requireTeacherClassroom(
  teacherId: string,
  courseId: string,
  classroomId: string,
  database: Prisma.TransactionClient | typeof prisma,
) {
  const course = await findTeacherCourse(database, teacherId, courseId);
  if (!course) throw new ResourceNotFoundError("课程不存在");
  const classroom = await findTeacherCourseClassroom(
    database,
    teacherId,
    courseId,
    classroomId,
  );
  if (!classroom) throw new ResourceNotFoundError("班级不存在");
  return classroom;
}

/** 频控：统计时间窗内已发布条数，超限时给出最早可再发时间。 */
async function assertWithinRateLimit(
  database: Prisma.TransactionClient | typeof prisma,
  classroomId: string,
  now: Date,
): Promise<void> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const where: Prisma.AnnouncementWhereInput = {
    classroomId,
    status: AnnouncementStatus.PUBLISHED,
    publishedAt: { gte: since },
  };
  const [count, oldest] = await Promise.all([
    database.announcement.count({ where }),
    database.announcement.findFirst({
      where,
      orderBy: { publishedAt: "asc" },
      select: { publishedAt: true },
    }),
  ]);
  if (count < PUBLISH_LIMIT_PER_WINDOW) return;
  const availableAt = oldest?.publishedAt
    ? new Date(oldest.publishedAt.getTime() + WINDOW_MS)
    : null;
  const hint = availableAt
    ? `最早可于 ${availableAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} 之后再次发布`
    : "请稍后再试";
  throw new AnnouncementOperationError(
    `本班 24 小时内已发布 ${count} 条通知，达到上限。${hint}`,
    429,
    "RATE_LIMITED",
  );
}

/** 24 小时内相同正文需要教师二次确认，避免重复催促造成打扰。 */
async function assertNotDuplicate(
  database: Prisma.TransactionClient | typeof prisma,
  input: {
    classroomId: string;
    content: string;
    excludeId?: string;
    confirmDuplicate: boolean;
    now: Date;
  },
): Promise<void> {
  if (input.confirmDuplicate) return;
  const duplicate = await database.announcement.findFirst({
    where: {
      classroomId: input.classroomId,
      status: AnnouncementStatus.PUBLISHED,
      content: input.content,
      publishedAt: { gte: new Date(input.now.getTime() - WINDOW_MS) },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new AnnouncementOperationError(
      "本班 24 小时内已发过相同内容，确认后再发一次",
      409,
      "DUPLICATE_CONTENT",
    );
  }
}

interface PublishOptions {
  teacherId: string;
  context: AuditRequestContext;
  now: Date;
  confirmDuplicate: boolean;
}

/** 在事务内完成「校验 → 改状态 → 生成通知 → 写审计」，供创建并发布与单独发布复用。 */
async function publishRecordInTransaction(
  transaction: Prisma.TransactionClient,
  record: CourseAnnouncementRecord,
  options: PublishOptions,
): Promise<{
  record: CourseAnnouncementRecord;
  createdNotificationCount: number;
  alreadyPublished: boolean;
}> {
  if (record.status === AnnouncementStatus.PUBLISHED) {
    return {
      record,
      createdNotificationCount: 0,
      alreadyPublished: true,
    };
  }
  if (record.status === AnnouncementStatus.REVOKED) {
    throw new AnnouncementOperationError(
      "已撤回的通知不能再次发布，请复制为新通知",
      409,
      "INVALID_STATE",
    );
  }
  if (!record.classroom) {
    throw new AnnouncementOperationError("课程通知缺少目标班级", 400);
  }
  assertClassroomActive(record.classroom);
  assertValidExpiry(record.expiresAt, options.now);
  await assertWithinRateLimit(transaction, record.classroom.id, options.now);

  const studentIds = await listClassroomStudentIds(
    transaction,
    record.classroom.id,
  );
  if (studentIds.length === 0) {
    throw new AnnouncementOperationError(
      "该班暂无在读学生，无法发布",
      400,
      "EMPTY_CLASSROOM",
    );
  }
  await assertNotDuplicate(transaction, {
    classroomId: record.classroom.id,
    content: record.content,
    excludeId: record.id,
    confirmDuplicate: options.confirmDuplicate,
    now: options.now,
  });

  const rendered = courseAnnouncementTemplate(record);
  const notifications = await createNotifications(
    studentIds.map((recipientId) => ({
      recipientId,
      type: NotificationType.COURSE_ANNOUNCEMENT,
      ...rendered,
      priority: NotificationPriority.IMPORTANT,
      actionUrl: "/notifications",
      sourceType: NotificationSourceType.ANNOUNCEMENT,
      sourceId: record.id,
      deduplicationKey: notificationDeduplication.courseAnnouncement(record.id),
      expiresAt: record.expiresAt,
    })),
    transaction,
  );

  const updated = await transaction.announcement.update({
    where: { id: record.id },
    data: {
      status: AnnouncementStatus.PUBLISHED,
      publishedAt: options.now,
      publishedById: options.teacherId,
    },
    select: courseAnnouncementSelect,
  });

  await writeAnnouncementAuditLog(transaction, {
    actorId: options.teacherId,
    action: AuditAction.ANNOUNCEMENT_PUBLISHED,
    targetId: record.id,
    summary: `发布课程通知：${record.title}`,
    beforeData: auditSnapshot(record),
    afterData: {
      ...auditSnapshot(updated),
      audienceCount: studentIds.length,
    },
    context: options.context,
  });

  return {
    record: updated,
    createdNotificationCount: notifications.createdCount,
    alreadyPublished: false,
  };
}

export async function listCourseAnnouncements(
  teacherId: string,
  query: CourseAnnouncementListQuery,
): Promise<CourseAnnouncementListResult> {
  const course = await findTeacherCourse(prisma, teacherId, query.courseId);
  if (!course) throw new ResourceNotFoundError("课程不存在");

  const where: Prisma.AnnouncementWhereInput = {
    targetType: AnnouncementTargetType.CLASSROOM,
    classroom: { courseId: query.courseId, teacherId },
    ...(query.classroomId
      ? { classroomId: query.classroomId }
      : { classroomId: { not: null } }),
    ...(query.status ? { status: query.status } : {}),
  };
  const { total, records } = await loadCourseAnnouncementPage(
    where,
    query.page,
    query.pageSize,
  );
  const classroomIds = [
    ...new Set(
      records
        .map((record) => record.classroom?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [audienceCounts, readCounts, batchClassrooms] = await Promise.all([
    loadClassroomAudienceCounts(classroomIds),
    loadReadCounts(records.map((record) => record.id)),
    loadBatchClassrooms(records),
  ]);

  return {
    items: records.map((record) =>
      toView(
        record,
        record.classroom ? (audienceCounts.get(record.classroom.id) ?? 0) : 0,
        readCounts.get(record.id) ?? 0,
        batchClassrooms.get(record.batchId ?? "") ?? [],
      ),
    ),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

/** 汇总本页每条记录的同批其他班级，供「同批 N 个班级」标记。 */
async function loadBatchClassrooms(
  records: CourseAnnouncementRecord[],
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const batchIds = [
    ...new Set(
      records
        .map((record) => record.batchId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (batchIds.length === 0) return new Map();
  const rows = await prisma.announcement.findMany({
    where: { batchId: { in: batchIds } },
    select: {
      id: true,
      batchId: true,
      classroom: { select: { id: true, name: true } },
    },
  });
  const map = new Map<string, Array<{ id: string; name: string }>>();
  // 先按批次收集全部班级，随后为每条记录排除自身，得到「同批其他班级」。
  const byBatch = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of rows) {
    if (!row.batchId || !row.classroom) continue;
    const list = byBatch.get(row.batchId) ?? [];
    list.push({ id: row.classroom.id, name: row.classroom.name });
    byBatch.set(row.batchId, list);
  }
  for (const record of records) {
    if (!record.batchId || !record.classroom) continue;
    const all = byBatch.get(record.batchId) ?? [];
    map.set(
      record.batchId,
      all.filter((item) => item.id !== record.classroom!.id),
    );
  }
  return map;
}

export async function getCourseAnnouncementAudience(
  teacherId: string,
  query: CourseAnnouncementAudienceQuery,
): Promise<CourseAnnouncementAudience> {
  const classrooms = await Promise.all(
    query.classroomIds.map((classroomId) =>
      requireTeacherClassroom(teacherId, query.courseId, classroomId, prisma),
    ),
  );
  const counts = await loadClassroomAudienceCounts(
    classrooms.map((classroom) => classroom.id),
  );
  const items = classrooms.map((classroom) => ({
    classroomId: classroom.id,
    classroomName: classroom.name,
    studentCount: counts.get(classroom.id) ?? 0,
  }));
  return {
    classrooms: items,
    totalStudentCount: items.reduce((sum, item) => sum + item.studentCount, 0),
  };
}

export async function createCourseAnnouncement(
  teacherId: string,
  rawInput: unknown,
  context: AuditRequestContext,
  now = new Date(),
): Promise<CourseAnnouncementCreateResult> {
  const input = courseAnnouncementCreateSchema.parse(rawInput);
  return serializableTransaction(async (transaction) => {
    const classrooms = await Promise.all(
      input.classroomIds.map((classroomId) =>
        requireTeacherClassroom(
          teacherId,
          input.courseId,
          classroomId,
          transaction,
        ),
      ),
    );
    for (const classroom of classrooms) assertClassroomActive(classroom);
    const expiresAt = resolveExpiry(input.expiresInDays, now);
    // 多班共享一个批次号；单班为 null，保持既有单班行为完全不变。
    const batchId = classrooms.length > 1 ? `ca_${randomUUID()}` : null;

    const audienceCounts = await loadClassroomAudienceCounts(
      classrooms.map((classroom) => classroom.id),
    );

    const createdRecords: CourseAnnouncementRecord[] = [];
    for (const classroom of classrooms) {
      const record = await transaction.announcement.create({
        data: {
          title: input.title,
          content: input.content,
          targetType: AnnouncementTargetType.CLASSROOM,
          classroomId: classroom.id,
          batchId,
          status: AnnouncementStatus.DRAFT,
          expiresAt,
          createdById: teacherId,
        },
        select: courseAnnouncementSelect,
      });
      createdRecords.push(record);
      await writeAnnouncementAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ANNOUNCEMENT_CREATED,
        targetId: record.id,
        summary: `创建课程通知草稿：${record.title}（${classroom.name}）`,
        beforeData: null,
        afterData: { ...auditSnapshot(record), batchId },
        context,
      });
    }

    if (!input.publish) {
      return {
        announcements: createdRecords.map((record) =>
          toView(record, audienceCounts.get(record.classroom!.id) ?? 0, 0),
        ),
        createdNotificationCount: 0,
        classroomCount: createdRecords.length,
      };
    }

    let totalCreated = 0;
    for (const record of createdRecords) {
      const published = await publishRecordInTransaction(transaction, record, {
        teacherId,
        context,
        now,
        confirmDuplicate: input.confirmDuplicate,
      });
      totalCreated += published.createdNotificationCount;
    }
    return {
      announcements: createdRecords.map((record) =>
        toView(record, audienceCounts.get(record.classroom!.id) ?? 0, 0),
      ),
      createdNotificationCount: totalCreated,
      classroomCount: createdRecords.length,
    };
  });
}

export async function updateCourseAnnouncement(
  teacherId: string,
  id: string,
  rawInput: unknown,
  context: AuditRequestContext,
  now = new Date(),
): Promise<CourseAnnouncementView> {
  const input = courseAnnouncementUpdateSchema.parse(rawInput);
  return serializableTransaction(async (transaction) => {
    const before = await findCourseAnnouncementById(id, transaction);
    if (!before?.classroom || before.classroom.teacherId !== teacherId) {
      throw new ResourceNotFoundError("通知不存在");
    }
    if (before.status !== AnnouncementStatus.DRAFT) {
      throw new AnnouncementOperationError(
        "只有草稿可以编辑",
        409,
        "INVALID_STATE",
      );
    }

    const targetClassroomId = input.classroomId ?? before.classroom.id;
    if (
      targetClassroomId !== before.classroom.id &&
      !before.classroom.courseId
    ) {
      throw new AnnouncementOperationError(
        "该班级未关联课程，无法转移通知",
        409,
      );
    }
    const classroom =
      targetClassroomId === before.classroom.id
        ? before.classroom
        : await requireTeacherClassroom(
            teacherId,
            before.classroom.courseId ?? "",
            targetClassroomId,
            transaction,
          );
    assertClassroomActive(classroom);

    const data: Prisma.AnnouncementUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.content !== undefined) data.content = input.content;
    if (input.classroomId) data.classroom = { connect: { id: classroom.id } };
    if (Object.hasOwn(input, "expiresInDays")) {
      const nextExpiry = resolveExpiry(input.expiresInDays, now);
      assertValidExpiry(nextExpiry, now);
      data.expiresAt = nextExpiry;
    }

    const after = await transaction.announcement.update({
      where: { id },
      data,
      select: courseAnnouncementSelect,
    });
    await writeAnnouncementAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.ANNOUNCEMENT_UPDATED,
      targetId: id,
      summary: `更新课程通知草稿：${after.title}`,
      beforeData: auditSnapshot(before),
      afterData: auditSnapshot(after),
      context,
    });
    return toView(
      after,
      await countClassroomAudience(transaction, classroom.id),
      0,
    );
  });
}

export async function publishCourseAnnouncement(
  teacherId: string,
  id: string,
  context: AuditRequestContext,
  options: { confirmDuplicate?: boolean; now?: Date } = {},
): Promise<CourseAnnouncementPublishResult> {
  const now = options.now ?? new Date();
  return serializableTransaction(async (transaction) => {
    const record = await findCourseAnnouncementById(id, transaction);
    if (!record?.classroom || record.classroom.teacherId !== teacherId) {
      throw new ResourceNotFoundError("通知不存在");
    }
    const published = await publishRecordInTransaction(transaction, record, {
      teacherId,
      context,
      now,
      confirmDuplicate: options.confirmDuplicate ?? false,
    });
    const classroomId = published.record.classroom?.id;
    if (!classroomId) {
      throw new AnnouncementOperationError("课程通知缺少目标班级", 400);
    }
    return {
      announcement: toView(
        published.record,
        await countClassroomAudience(transaction, classroomId),
        0,
      ),
      createdNotificationCount: published.createdNotificationCount,
      alreadyPublished: published.alreadyPublished,
    };
  });
}

export async function revokeCourseAnnouncement(
  teacherId: string,
  id: string,
  context: AuditRequestContext,
  now = new Date(),
): Promise<CourseAnnouncementPublishResult> {
  return serializableTransaction(async (transaction) => {
    const before = await findCourseAnnouncementById(id, transaction);
    if (!before?.classroom || before.classroom.teacherId !== teacherId) {
      throw new ResourceNotFoundError("通知不存在");
    }
    if (before.status !== AnnouncementStatus.PUBLISHED) {
      throw new AnnouncementOperationError(
        "只有已发布的通知可以撤回",
        409,
        "INVALID_STATE",
      );
    }

    // 学生已读的通知保留（避免「看过的东西消失」），未读的直接删除。
    const removed = await transaction.notification.deleteMany({
      where: {
        sourceType: NotificationSourceType.ANNOUNCEMENT,
        sourceId: id,
        readAt: null,
      },
    });
    const after = await transaction.announcement.update({
      where: { id },
      data: {
        status: AnnouncementStatus.REVOKED,
        revokedAt: now,
        revokedById: teacherId,
      },
      select: courseAnnouncementSelect,
    });
    await writeAnnouncementAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.ANNOUNCEMENT_REVOKED,
      targetId: id,
      summary: `撤回课程通知：${after.title}`,
      beforeData: auditSnapshot(before),
      afterData: {
        ...auditSnapshot(after),
        deletedNotificationCount: removed.count,
      },
      context,
    });
    return {
      announcement: toView(
        after,
        await countClassroomAudience(transaction, before.classroom.id),
        0,
      ),
      createdNotificationCount: 0,
      alreadyPublished: false,
    };
  });
}

export async function deleteCourseAnnouncement(
  teacherId: string,
  id: string,
  context: AuditRequestContext,
): Promise<{ id: string }> {
  return serializableTransaction(async (transaction) => {
    const before = await findCourseAnnouncementById(id, transaction);
    if (!before?.classroom || before.classroom.teacherId !== teacherId) {
      throw new ResourceNotFoundError("通知不存在");
    }
    if (before.status !== AnnouncementStatus.DRAFT) {
      throw new AnnouncementOperationError(
        "已发布的通知不能删除，请先撤回",
        409,
        "INVALID_STATE",
      );
    }
    await writeAnnouncementAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.ANNOUNCEMENT_UPDATED,
      targetId: id,
      summary: `删除课程通知草稿：${before.title}`,
      beforeData: auditSnapshot(before),
      afterData: null,
      context,
    });
    await transaction.announcement.delete({ where: { id } });
    return { id };
  });
}

/** 校验批次归属：批次内至少有一条属于该教师，且该教师拥有批次内全部记录。 */
async function requireTeacherBatch(
  teacherId: string,
  batchId: string,
  database: Prisma.TransactionClient | typeof prisma,
): Promise<CourseAnnouncementRecord[]> {
  const records = await listAnnouncementsByBatch(database, batchId);
  if (records.length === 0) throw new ResourceNotFoundError("批次不存在");
  const ownsAll = records.every(
    (record) => record.classroom?.teacherId === teacherId,
  );
  if (!ownsAll) throw new ResourceNotFoundError("批次不存在");
  return records;
}

/** 整批撤回：撤回同批全部「已发布」记录，删除其未读通知。 */
export async function revokeCourseAnnouncementBatch(
  teacherId: string,
  input: CourseAnnouncementBatchInput,
  context: AuditRequestContext,
  now = new Date(),
): Promise<CourseAnnouncementBatchResult> {
  return serializableTransaction(async (transaction) => {
    const records = await requireTeacherBatch(
      teacherId,
      input.batchId,
      transaction,
    );
    const published = records.filter(
      (record) => record.status === AnnouncementStatus.PUBLISHED,
    );
    const audienceCounts = await loadClassroomAudienceCounts(
      published.map((record) => record.classroom!.id),
    );

    let deletedNotificationCount = 0;
    const revoked: CourseAnnouncementView[] = [];
    for (const record of published) {
      const removed = await transaction.notification.deleteMany({
        where: {
          sourceType: NotificationSourceType.ANNOUNCEMENT,
          sourceId: record.id,
          readAt: null,
        },
      });
      deletedNotificationCount += removed.count;
      const after = await transaction.announcement.update({
        where: { id: record.id },
        data: {
          status: AnnouncementStatus.REVOKED,
          revokedAt: now,
          revokedById: teacherId,
        },
        select: courseAnnouncementSelect,
      });
      await writeAnnouncementAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ANNOUNCEMENT_REVOKED,
        targetId: record.id,
        summary: `撤回课程通知：${after.title}`,
        beforeData: auditSnapshot(record),
        afterData: {
          ...auditSnapshot(after),
          deletedNotificationCount: removed.count,
        },
        context,
      });
      revoked.push(
        toView(after, audienceCounts.get(record.classroom!.id) ?? 0, 0),
      );
    }
    return { revoked, deletedNotificationCount };
  });
}

/** 整批复制：以同批第一条为模板，复制为新的草稿批次（新 batchId）。 */
export async function duplicateCourseAnnouncementBatch(
  teacherId: string,
  input: CourseAnnouncementBatchInput,
  context: AuditRequestContext,
  now = new Date(),
): Promise<CourseAnnouncementCreateResult> {
  return serializableTransaction(async (transaction) => {
    const records = await requireTeacherBatch(
      teacherId,
      input.batchId,
      transaction,
    );
    if (records.length === 0) throw new ResourceNotFoundError("批次不存在");
    const template = records[0];
    const expiresAt = template.expiresAt
      ? new Date(Math.max(now.getTime(), template.expiresAt.getTime()))
      : null;
    const newBatchId = records.length > 1 ? `ca_${randomUUID()}` : null;

    const audienceCounts = await loadClassroomAudienceCounts(
      records.map((record) => record.classroom!.id),
    );

    const created: CourseAnnouncementView[] = [];
    for (const record of records) {
      const classroomId = record.classroom?.id;
      if (!classroomId) continue;
      const draft = await transaction.announcement.create({
        data: {
          title: `${template.title}（副本）`,
          content: template.content,
          targetType: AnnouncementTargetType.CLASSROOM,
          classroomId,
          batchId: newBatchId,
          status: AnnouncementStatus.DRAFT,
          expiresAt,
          createdById: teacherId,
        },
        select: courseAnnouncementSelect,
      });
      await writeAnnouncementAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ANNOUNCEMENT_CREATED,
        targetId: draft.id,
        summary: `复制课程通知草稿：${draft.title}`,
        beforeData: null,
        afterData: { ...auditSnapshot(draft), batchId: newBatchId },
        context,
      });
      created.push(toView(draft, audienceCounts.get(classroomId) ?? 0, 0));
    }
    return {
      announcements: created,
      createdNotificationCount: 0,
      classroomCount: created.length,
    };
  });
}
