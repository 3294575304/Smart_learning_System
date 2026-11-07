import type {
  NotificationPriority,
  NotificationType,
  NotificationSourceType,
} from "@prisma/client";

export type StudentNotificationAction =
  | { kind: "LINK"; label: string; href: string }
  | {
      kind: "START_ASSIGNMENT";
      label: string;
      assignmentId: string;
      courseId?: string;
      classroomId: string;
    };

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
  sourceType?: NotificationSourceType;
  sourceId?: string;
  action?: StudentNotificationAction | null;
  actionMessage?: string;
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
