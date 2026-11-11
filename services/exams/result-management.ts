import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AssignmentOperationError } from "@/services/assignments/errors";
import {
  lockAssignmentLifecycle,
  touchAssignmentLifecycle,
} from "@/services/assignments/lifecycle-lock";
import {
  getAssignmentPublicationState,
  publishAssignmentResults,
} from "@/services/assignments/manual-grading";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import type { examMonitorScope, examPublicationPolicy } from "./result-schemas";

type Scope = z.infer<typeof examMonitorScope>;
type Policy = z.infer<typeof examPublicationPolicy>;

export async function findExamClassAssignment(teacherId: string, scope: Scope) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      teacherId,
      examSessionId: scope.examId,
      classroomId: scope.classroomId,
      deletedAt: null,
      examSession: { teacherId },
      classroom: { teacherId },
    },
    select: { id: true },
  });
  if (!assignment) throw new ResourceNotFoundError("考试教学班不存在");
  return assignment.id;
}

export async function getExamResultManagement(
  teacherId: string,
  assignmentId: string,
) {
  const [publication, policy, reviews] = await Promise.all([
    getAssignmentPublicationState(teacherId, assignmentId),
    prisma.examResultPublication.findFirst({
      where: { assignmentId, assignment: { teacherId, deletedAt: null } },
      select: { mode: true, scheduledAt: true, completedAt: true },
    }),
    prisma.examScoreReview.findMany({
      where: {
        submission: {
          assignmentId,
          assignment: { teacherId, deletedAt: null },
        },
      },
      orderBy: [
        { resolvedAt: { sort: "desc", nulls: "first" } },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        reason: true,
        response: true,
        resolvedAt: true,
        submission: {
          select: {
            id: true,
            student: {
              select: {
                profile: { select: { displayName: true, studentNo: true } },
              },
            },
          },
        },
      },
    }),
  ]);
  return { publication, policy, reviews };
}

export async function setExamResultPublication(
  teacherId: string,
  assignmentId: string,
  policy: Policy,
  context: AuditRequestContext,
) {
  return runAssignmentSerializable(async (tx) => {
    const assignment = await lockAssignmentLifecycle(
      tx,
      assignmentId,
      teacherId,
    );
    const exam = assignment.examSessionId
      ? await tx.examSession.findFirst({
          where: { id: assignment.examSessionId, teacherId },
          select: { endsAt: true, cancelledAt: true },
        })
      : null;
    if (!exam) throw new ResourceNotFoundError("考试不存在");
    if (
      exam.cancelledAt ||
      !["PUBLISHED", "CLOSED"].includes(assignment.status)
    )
      throw new AssignmentOperationError("当前考试不能设置公布方式", 409);
    if (
      await tx.submission.count({
        where: { assignmentId, publishedAt: { not: null } },
      })
    )
      throw new AssignmentOperationError("成绩已经公布，无法重新安排公布", 409);
    const scheduledAt =
      policy.mode === "SCHEDULED" ? new Date(policy.scheduledAt) : null;
    if (scheduledAt && (scheduledAt < exam.endsAt || scheduledAt <= new Date()))
      throw new AssignmentOperationError(
        "定时公布须晚于当前时间，且不得早于考试结束",
        400,
      );
    const previous = await tx.examResultPublication.findUnique({
      where: { assignmentId },
    });
    if (
      (!previous && policy.mode === "MANUAL") ||
      (previous?.mode === policy.mode &&
        previous.scheduledAt?.getTime() === scheduledAt?.getTime())
    )
      return { mode: policy.mode };
    if (policy.mode === "MANUAL") {
      await tx.examResultPublication.deleteMany({ where: { assignmentId } });
    } else {
      const data = {
        mode: policy.mode,
        scheduledAt,
        revision: randomUUID(),
        completedAt: null,
        checkedAt: null,
      };
      await tx.examResultPublication.upsert({
        where: { assignmentId },
        create: { assignmentId, ...data },
        update: data,
      });
    }
    await touchAssignmentLifecycle(tx, assignmentId);
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: "EXAM_PUBLICATION_POLICY_UPDATED",
      targetType: "ASSIGNMENT",
      targetId: assignmentId,
      summary: "调整考试成绩公布方式",
      beforeData: {
        mode: previous?.mode ?? "MANUAL",
        scheduledAt: previous?.scheduledAt?.toISOString() ?? null,
      },
      afterData: {
        mode: policy.mode,
        scheduledAt: scheduledAt?.toISOString() ?? null,
      },
      context,
    });
    return { mode: policy.mode };
  }, "考试公布方式已发生变化，请刷新重试");
}

/** The normal publication transaction rechecks the policy revision, timing and grades. */
export async function publishDueExamResults(now = new Date()) {
  const due = await prisma.examResultPublication.findMany({
    where: {
      completedAt: null,
      OR: [
        { mode: "WHEN_READY" },
        { mode: "SCHEDULED", scheduledAt: { lte: now } },
      ],
      assignment: {
        deletedAt: null,
        status: { in: ["PUBLISHED", "CLOSED"] },
        examSession: { cancelledAt: null, endsAt: { lte: now } },
        submissions: { some: { status: "GRADED" } },
      },
    },
    orderBy: [
      { checkedAt: { sort: "asc", nulls: "first" } },
      { assignmentId: "asc" },
    ],
    take: 20,
    select: {
      assignmentId: true,
      revision: true,
      assignment: {
        select: { teacherId: true, teacher: { select: { status: true } } },
      },
    },
  });
  let published = 0;
  for (const item of due) {
    await prisma.examResultPublication.updateMany({
      where: {
        assignmentId: item.assignmentId,
        revision: item.revision,
        completedAt: null,
      },
      data: { checkedAt: now },
    });
    if (item.assignment.teacher.status !== "ACTIVE") continue;
    try {
      const result = await publishAssignmentResults(
        item.assignment.teacherId,
        item.assignmentId,
        { ipAddress: null, userAgent: "exam-result-worker" },
        item.revision,
      );
      published += result.publishedCount;
    } catch (error) {
      if (!(
        error instanceof AssignmentOperationError ||
        error instanceof ResourceNotFoundError
      ))
        console.error("exam_result_publication_failed", {
          assignmentId: item.assignmentId,
          error: error instanceof Error ? error.name : "UnknownError",
        });
    }
  }
  return published;
}
