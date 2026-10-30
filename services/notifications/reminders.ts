import { publishedResultsWhere } from "@/services/assignments/work-access";
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
    await prisma.$executeRaw`UPDATE "AssignmentMakeupGrant" g SET status='EXPIRED', "updatedAt"=(${now.toISOString()}::timestamp) FROM "Assignment" a JOIN "Classroom" c ON c.id=a."classroomId" WHERE g."assignmentId"=a.id AND g.status='ACTIVE' AND (g."expiresAt"<=(${now.toISOString()}::timestamp) OR a.status<>'PUBLISHED' OR c.status<>'ACTIVE' OR NOT EXISTS (SELECT 1 FROM "ClassMembership" m JOIN "User" u ON u.id=m."studentId" WHERE m."studentId"=g."studentId" AND m."classroomId"=a."classroomId" AND m.status='ACTIVE' AND u.status='ACTIVE'))`;
    const dueBefore = new Date(
      now.getTime() + ASSIGNMENT_DUE_REMINDER_HOURS * 60 * 60 * 1_000,
    );
    const assignments = await prisma.assignment.findMany({
      where: {
        status: AssignmentStatus.PUBLISHED,
        publishedAt: { lte: now },
        dueAt: { gt: now, lte: dueBefore },
        classroom: { status: ClassroomStatus.ACTIVE },
        submissions: { none: publishedResultsWhere },
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
    const grants = await prisma.assignmentMakeupGrant.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now, lte: dueBefore },
        student: { role: "STUDENT", status: "ACTIVE" },
        assignment: {
          status: "PUBLISHED",
          publishedAt: { lte: now },
          classroom: { status: "ACTIVE" },
          submissions: { none: publishedResultsWhere },
        },
      },
      take: ASSIGNMENT_REMINDER_ASSIGNMENT_LIMIT,
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      include: {
        assignment: {
          select: {
            id: true,
            title: true,
            classroom: {
              select: {
                memberships: {
                  where: { status: "ACTIVE" },
                  select: { studentId: true },
                },
              },
            },
          },
        },
      },
    });
    const grantCandidates = grants
      .filter((g) =>
        g.assignment.classroom.memberships.some(
          (m) => m.studentId === g.studentId,
        ),
      )
      .map((g) => ({
        recipientId: g.studentId,
        assignmentId: g.assignmentId,
        assignmentTitle: `${g.assignment.title}（${g.kind === "REDO" ? "重做" : "补交"}）`,
        dueAt: g.expiresAt,
        grantId: g.id,
      }));
    const grantStudents = new Set(
      grantCandidates.map((g) => `${g.assignmentId}:${g.recipientId}`),
    );
    const combined = [
      ...candidates.filter(
        (c) => !grantStudents.has(`${c.assignmentId}:${c.recipientId}`),
      ),
      ...grantCandidates,
    ];
    const writeResult = await notifyAssignmentsDueSoon(combined);
    const result = {
      runId: run.id,
      scannedCount: assignments.length + grants.length,
      createdCount: writeResult.createdCount,
      skippedCount: Math.max(
        0,
        activeRecipientCount +
          grantCandidates.length -
          writeResult.createdCount,
      ),
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
