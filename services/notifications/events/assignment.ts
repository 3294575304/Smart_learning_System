import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
} from "@prisma/client";

import { notificationDeduplication } from "@/services/notifications/deduplication";
import type { NotificationDatabaseClient } from "@/services/notifications/repository";
import {
  createNotification,
  createNotifications,
} from "@/services/notifications/service";
import {
  assignmentDueSoonTemplate,
  assignmentGradedTemplate,
  assignmentPublishedTemplate,
} from "@/services/notifications/templates";

export async function notifyAssignmentPublished(
  input: {
    assignmentId: string;
    assignmentTitle: string;
    teacherName: string;
    dueAt: Date;
    recipientIds: string[];
  },
  database: NotificationDatabaseClient,
) {
  const content = assignmentPublishedTemplate(input);
  return createNotifications(
    input.recipientIds.map((recipientId) => ({
      recipientId,
      type: NotificationType.ASSIGNMENT_PUBLISHED,
      ...content,
      priority: NotificationPriority.NORMAL,
      actionUrl: `/student/assignments/${input.assignmentId}`,
      sourceType: NotificationSourceType.ASSIGNMENT,
      sourceId: input.assignmentId,
      deduplicationKey: notificationDeduplication.assignmentPublished(
        input.assignmentId,
      ),
      expiresAt: null,
    })),
    database,
  );
}

export async function notifyAssignmentsDueSoon(
  inputs: Array<{
    recipientId: string;
    assignmentId: string;
    assignmentTitle: string;
    dueAt: Date;
  }>,
) {
  return createNotifications(
    inputs.map((input) => ({
      recipientId: input.recipientId,
      type: NotificationType.ASSIGNMENT_DUE_SOON,
      ...assignmentDueSoonTemplate(input),
      priority: NotificationPriority.IMPORTANT,
      actionUrl: `/student/assignments/${input.assignmentId}`,
      sourceType: NotificationSourceType.ASSIGNMENT,
      sourceId: input.assignmentId,
      deduplicationKey: notificationDeduplication.assignmentDueSoon(
        input.assignmentId,
      ),
      expiresAt: input.dueAt,
    })),
  );
}

export async function notifyAssignmentGraded(input: {
  recipientId: string;
  submissionId: string;
  assignmentTitle: string;
}) {
  return createNotification({
    recipientId: input.recipientId,
    type: NotificationType.ASSIGNMENT_GRADED,
    ...assignmentGradedTemplate(input),
    priority: NotificationPriority.NORMAL,
    actionUrl: `/student/submissions/${input.submissionId}/result`,
    sourceType: NotificationSourceType.SUBMISSION,
    sourceId: input.submissionId,
    deduplicationKey: notificationDeduplication.assignmentGraded(
      input.submissionId,
    ),
    expiresAt: null,
  });
}
