import "server-only";

import type { Role } from "@prisma/client";

import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  findOwnedNotification,
  insertNotifications,
  loadActiveRecipientIds,
  loadNotificationPage,
  markAllOwnedNotificationsRead,
  markOwnedNotificationRead,
  notificationDatabase,
  type NotificationDatabaseClient,
  countUnreadNotifications,
} from "@/services/notifications/repository";
import {
  notificationCreateInputSchema,
  type NotificationCreateInput,
  type NotificationListQuery,
} from "@/services/notifications/schemas";
import type {
  MarkNotificationReadResult,
  NotificationListResult,
  NotificationWriteResult,
} from "@/services/notifications/types";

export async function createNotifications(
  inputs: NotificationCreateInput[],
  database: NotificationDatabaseClient = notificationDatabase,
): Promise<NotificationWriteResult> {
  const parsed = inputs.map((input) =>
    notificationCreateInputSchema.parse(input),
  );
  if (parsed.length === 0) return { createdCount: 0, skippedCount: 0 };
  const createdCount = await insertNotifications(database, parsed);
  return {
    createdCount,
    skippedCount: parsed.length - createdCount,
  };
}

export async function createNotification(
  input: NotificationCreateInput,
  database: NotificationDatabaseClient = notificationDatabase,
): Promise<NotificationWriteResult> {
  return createNotifications([input], database);
}

export async function createRoleNotifications(
  roles: readonly Role[] | undefined,
  input: Omit<NotificationCreateInput, "recipientId">,
  database: NotificationDatabaseClient = notificationDatabase,
): Promise<NotificationWriteResult> {
  const recipientIds = await loadActiveRecipientIds(database, roles);
  return createNotifications(
    recipientIds.map((recipientId) => ({ ...input, recipientId })),
    database,
  );
}

export async function getUserNotifications(
  recipientId: string,
  query: NotificationListQuery,
  now = new Date(),
): Promise<NotificationListResult> {
  const { total, records } = await loadNotificationPage(
    recipientId,
    query,
    now,
  );
  return {
    items: records,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getUnreadNotificationCount(
  recipientId: string,
  now = new Date(),
): Promise<number> {
  return Math.max(0, await countUnreadNotifications(recipientId, now));
}

export async function markNotificationRead(
  recipientId: string,
  notificationId: string,
  now = new Date(),
): Promise<MarkNotificationReadResult> {
  const notification = await findOwnedNotification(recipientId, notificationId);
  if (!notification) throw new ResourceNotFoundError("通知不存在");
  if (notification.readAt) {
    return { id: notification.id, readAt: notification.readAt };
  }
  await markOwnedNotificationRead(recipientId, notificationId, now);
  const latest = await findOwnedNotification(recipientId, notificationId);
  if (!latest?.readAt) throw new ResourceNotFoundError("通知不存在");
  return { id: latest.id, readAt: latest.readAt };
}

export async function markAllNotificationsRead(
  recipientId: string,
  now = new Date(),
): Promise<{ updatedCount: number }> {
  const result = await markAllOwnedNotificationsRead(recipientId, now);
  return { updatedCount: result.count };
}
