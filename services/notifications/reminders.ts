import "server-only";

import {
  AssignmentStatus,
  ClassroomStatus,
  MembershipStatus,
  NotificationJobStatus,
  NotificationJobType,
  Role,
  SubmissionStatus,
  UserStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  ASSIGNMENT_DUE_REMINDER_HOURS,
  ASSIGNMENT_REMINDER_ASSIGNMENT_LIMIT,
} from "@/services/notifications/constants";
import { notifyAssignmentsDueSoon } from "@/services/notifications/events/assignment";
import { logNotificationFailure } from "@/services/notifications/logging";
import type { AssignmentReminderRunResult } from "@/services/notifications/types";

const SUBMITTED_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.PENDING_REVIEW,
  SubmissionStatus.GRADED,
  SubmissionStatus.PUBLISHED,
];

export async function runAssignmentDueReminders(
  now = new Date(),
): Promise<AssignmentReminderRunResult> {
  const run = await prisma.notificationJobRun.create({
    data: {
      type: NotificationJobType.ASSIGNMENT_DUE_REMINDER,
      status: NotificationJobStatus.SUCCEEDED,
      startedAt: now,
    },
    select: { id: true },
  });
  try {
    const dueBefore = new Date(
      now.getTime() + ASSIGNMENT_DUE_REMINDER_HOURS * 60 * 60 * 1_000,
    );
    const assignments = await prisma.assignment.findMany({
      where: {
        status: AssignmentStatus.PUBLISHED,
        publishedAt: { lte: now },
        dueAt: { gt: now, lte: dueBefore },
        classroom: { status: ClassroomStatus.ACTIVE },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: ASSIGNMENT_REMINDER_ASSIGNMENT_LIMIT,
      select: {
        id: true,
        title: true,
        dueAt: true,
        classroom: {
          select: {
            memberships: {
              where: {
                status: MembershipStatus.ACTIVE,
                student: {
                  role: Role.STUDENT,
                  status: UserStatus.ACTIVE,
                },
              },
              select: { studentId: true },
            },
          },
        },
        submissions: {
          where: { status: { in: SUBMITTED_STATUSES } },
          select: { studentId: true },
        },
      },
    });

    let activeRecipientCount = 0;
    const candidates = assignments.flatMap((assignment) => {
      activeRecipientCount += assignment.classroom.memberships.length;
      if (!assignment.dueAt) return [];
      const dueAt = assignment.dueAt;
      const submittedStudentIds = new Set(
        assignment.submissions.map((submission) => submission.studentId),
      );
      return assignment.classroom.memberships.flatMap((membership) =>
        submittedStudentIds.has(membership.studentId)
          ? []
          : [
              {
                recipientId: membership.studentId,
                assignmentId: assignment.id,
                assignmentTitle: assignment.title,
                dueAt,
              },
            ],
      );
    });
    const writeResult = await notifyAssignmentsDueSoon(candidates);
    const result = {
      runId: run.id,
      scannedCount: assignments.length,
      createdCount: writeResult.createdCount,
      skippedCount: activeRecipientCount - writeResult.createdCount,
      failedCount: 0,
    };
    await prisma.notificationJobRun.update({
      where: { id: run.id },
      data: {
        status: NotificationJobStatus.SUCCEEDED,
        scannedCount: result.scannedCount,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        completedAt: new Date(),
      },
    });
    console.info(
      JSON.stringify({
        level: "info",
        event: "assignment_due_reminder_completed",
        ...result,
      }),
    );
    return result;
  } catch (error: unknown) {
    logNotificationFailure("assignment_due_reminder", run.id);
    await prisma.notificationJobRun
      .update({
        where: { id: run.id },
        data: {
          status: NotificationJobStatus.FAILED,
          failedCount: 1,
          errorSummary: "Assignment reminder execution failed",
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
    throw error;
  }
}
