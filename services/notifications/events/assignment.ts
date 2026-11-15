import {
  NotificationPriority,
  Prisma,
  NotificationSourceType,
  NotificationType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { notificationDeduplication } from "@/services/notifications/deduplication";
import type { NotificationDatabaseClient } from "@/services/notifications/repository";
import { createNotifications } from "@/services/notifications/service";
import {
  assignmentDueSoonTemplate,
  assignmentGradedTemplate,
  assignmentPublishedTemplate,
} from "@/services/notifications/templates";

export async function notifyAssignmentPublished(
  input: {
    assignmentId: string;
    assignmentTitle: string;
    publicationKey?: string;
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
        input.publicationKey,
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
    grantId?: string;
  }>,
) {
  if (!inputs.length) return { createdCount: 0, skippedCount: 0 };
  return prisma.$transaction(async (tx) => {
    const ids = [...new Set(inputs.map((input) => input.assignmentId))];
    const live = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Assignment"
      WHERE id IN (${Prisma.join(ids)}) AND status = 'PUBLISHED' AND "deletedAt" IS NULL
      ORDER BY id FOR SHARE`;
    const active = new Set(live.map(({ id }) => id));
    return createNotifications(
      inputs
        .filter((input) => active.has(input.assignmentId))
        .map((input) => ({
          recipientId: input.recipientId,
          type: NotificationType.ASSIGNMENT_DUE_SOON,
          ...assignmentDueSoonTemplate(input),
          priority: NotificationPriority.IMPORTANT,
          actionUrl: `/student/assignments/${input.assignmentId}`,
          sourceType: NotificationSourceType.ASSIGNMENT,
          sourceId: input.assignmentId,
          deduplicationKey: notificationDeduplication.assignmentDueSoon(
            input.assignmentId,
            `${input.grantId ?? "class"}:${input.dueAt.toISOString()}`,
          ),
          expiresAt: input.dueAt,
        })),
      tx,
    );
  });
}

interface AssignmentGradeNotification {
  recipientId: string;
  submissionId: string;
  assignmentTitle: string;
}

export async function notifyAssignmentGraded(
  input: AssignmentGradeNotification,
  database: NotificationDatabaseClient = prisma,
) {
  return notifyAssignmentGradesPublished([input], database);
}

export async function notifyAssignmentGradesPublished(
  inputs: AssignmentGradeNotification[],
  database: NotificationDatabaseClient = prisma,
) {
  return createNotifications(
    inputs.map((input) => ({
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
    })),
    database,
  );
}

/** Repairs historical publication gaps, including after a worker restart. */
export async function deliverMissingAssignmentGradeNotifications() {
  return prisma.$transaction(async (tx) => {
    const missing = await tx.$queryRaw<AssignmentGradeNotification[]>`
      SELECT s.id AS "submissionId", s."studentId" AS "recipientId",
             a.title AS "assignmentTitle"
      FROM "Submission" s
      JOIN "Assignment" a ON a.id = s."assignmentId"
      JOIN "User" u ON u.id = s."studentId"
      JOIN "ClassMembership" m ON m."classroomId" = a."classroomId"
        AND m."studentId" = s."studentId"
      WHERE s.status = 'PUBLISHED' AND a."deletedAt" IS NULL
        AND a.status IN ('PUBLISHED', 'CLOSED')
        AND u.status = 'ACTIVE' AND m.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM "Notification" n
          WHERE n."recipientId" = s."studentId"
            AND n."deduplicationKey" = 'assignment-graded:' || s.id
        )
      ORDER BY s."publishedAt" ASC, s.id ASC
      LIMIT 100 FOR SHARE OF a, s, m`;
    return notifyAssignmentGradesPublished(missing, tx);
  });
}
