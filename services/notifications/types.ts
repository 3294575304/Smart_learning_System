import type { NotificationPriority, NotificationType } from "@prisma/client";

export interface NotificationListItem {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  priority: NotificationPriority;
  actionUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface NotificationListResult {
  items: NotificationListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface NotificationWriteResult {
  createdCount: number;
  skippedCount: number;
}

export interface MarkNotificationReadResult {
  id: string;
  readAt: Date;
}

export interface AssignmentReminderRunResult {
  runId: string;
  scannedCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
}
