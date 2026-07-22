import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
} from "@prisma/client";
import { z } from "zod";

import {
  NOTIFICATION_MAX_CONTENT_LENGTH,
  NOTIFICATION_MAX_TITLE_LENGTH,
} from "@/services/notifications/constants";

export const notificationIdSchema = z.string().cuid("通知 ID 格式无效");

export const notificationActionUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\") &&
      !/[\u0000-\u001f\u007f]/u.test(value),
    "通知跳转地址必须是安全的站内路径",
  );

export const notificationListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    status: z.enum(["UNREAD", "READ"]).optional(),
    type: z.nativeEnum(NotificationType).optional(),
    priority: z.nativeEnum(NotificationPriority).optional(),
  })
  .strict();

export const notificationCreateInputSchema = z
  .object({
    recipientId: z.string().cuid(),
    type: z.nativeEnum(NotificationType),
    title: z.string().trim().min(1).max(NOTIFICATION_MAX_TITLE_LENGTH),
    content: z.string().trim().min(1).max(NOTIFICATION_MAX_CONTENT_LENGTH),
    priority: z
      .nativeEnum(NotificationPriority)
      .default(NotificationPriority.NORMAL),
    actionUrl: notificationActionUrlSchema.nullable().default(null),
    sourceType: z.nativeEnum(NotificationSourceType),
    sourceId: z.string().trim().min(1).max(128),
    deduplicationKey: z.string().trim().min(1).max(191),
    expiresAt: z.date().nullable().default(null),
  })
  .strict();

export type NotificationListQuery = z.output<
  typeof notificationListQuerySchema
>;
export type NotificationCreateInput = z.output<
  typeof notificationCreateInputSchema
>;
