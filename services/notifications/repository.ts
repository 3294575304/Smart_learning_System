import "server-only";

import { Prisma, type Role, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { NOTIFICATION_BATCH_SIZE } from "@/services/notifications/constants";
import type {
  NotificationCreateInput,
  NotificationListQuery,
} from "@/services/notifications/schemas";

export type NotificationDatabaseClient = Pick<
  Prisma.TransactionClient,
  "notification" | "user"
>;

const notificationListSelect = Prisma.validator<Prisma.NotificationSelect>()({
  id: true,
  type: true,
  title: true,
  content: true,
  priority: true,
  actionUrl: true,
  readAt: true,
  createdAt: true,
  expiresAt: true,
});

function activeNotificationWhere(
  recipientId: string,
  query: NotificationListQuery,
  now: Date,
): Prisma.NotificationWhereInput {
  return {
    recipientId,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    ...(query.status === "UNREAD"
      ? { readAt: null }
      : query.status === "READ"
        ? { readAt: { not: null } }
        : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
  };
}

export async function loadNotificationPage(
  recipientId: string,
  query: NotificationListQuery,
  now: Date,
) {
  const where = activeNotificationWhere(recipientId, query, now);
  const [total, records] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      select: notificationListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { total, records };
}

export function countUnreadNotifications(
  recipientId: string,
  now: Date,
): Promise<number> {
  return prisma.notification.count({
    where: {
      recipientId,
      readAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

export function findOwnedNotification(
  recipientId: string,
  notificationId: string,
) {
  return prisma.notification.findFirst({
    where: { id: notificationId, recipientId },
    select: { id: true, readAt: true },
  });
}

export async function markOwnedNotificationRead(
  recipientId: string,
  notificationId: string,
  readAt: Date,
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientId, readAt: null },
    data: { readAt },
  });
}

export function markAllOwnedNotificationsRead(
  recipientId: string,
  readAt: Date,
) {
  return prisma.notification.updateMany({
    where: {
      recipientId,
      readAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: readAt } }],
    },
    data: { readAt },
  });
}

export async function insertNotifications(
  database: NotificationDatabaseClient,
  inputs: NotificationCreateInput[],
): Promise<number> {
  let createdCount = 0;
  for (
    let offset = 0;
    offset < inputs.length;
    offset += NOTIFICATION_BATCH_SIZE
  ) {
    const batch = inputs.slice(offset, offset + NOTIFICATION_BATCH_SIZE);
    const result = await database.notification.createMany({
      data: batch.map((input) => ({
        recipientId: input.recipientId,
        type: input.type,
        title: input.title,
        content: input.content,
        priority: input.priority,
        actionUrl: input.actionUrl,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        deduplicationKey: input.deduplicationKey,
        expiresAt: input.expiresAt,
      })),
      skipDuplicates: true,
    });
    createdCount += result.count;
  }
  return createdCount;
}

export async function loadActiveRecipientIds(
  database: NotificationDatabaseClient,
  roles?: readonly Role[],
): Promise<string[]> {
  const users = await database.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      ...(roles && roles.length > 0 ? { role: { in: [...roles] } } : {}),
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return users.map((user) => user.id);
}

export const notificationDatabase = prisma;
