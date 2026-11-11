import "server-only";
import { prisma } from "@/lib/prisma";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";

const reviewSelect = {
  id: true,
  reason: true,
  response: true,
  resolvedAt: true,
  createdAt: true,
} as const;

export async function getStudentExamReview(
  studentId: string,
  submissionId: string,
) {
  return prisma.examScoreReview.findFirst({
    where: { submissionId, submission: { studentId, status: "PUBLISHED" } },
    select: reviewSelect,
  });
}

export async function requestExamScoreReview(
  studentId: string,
  submissionId: string,
  reason: string,
  context: AuditRequestContext,
) {
  await runAssignmentSerializable(async (tx) => {
    const submission = await tx.submission.findFirst({
      where: {
        id: submissionId,
        studentId,
        status: "PUBLISHED",
        assignment: { deletedAt: null, examSession: { cancelledAt: null } },
      },
      select: { id: true },
    });
    if (!submission)
      throw new ResourceNotFoundError("未找到已公布成绩的考试答卷");
    const inserted = await tx.examScoreReview.createMany({
      data: [{ submissionId, reason }],
      skipDuplicates: true,
    });
    if (inserted.count) {
      await writeTeachingAuditLog(tx, {
        actorId: studentId,
        action: "EXAM_SCORE_REVIEW_REQUESTED",
        targetType: "SUBMISSION",
        targetId: submissionId,
        summary: "提交考试成绩复核申请",
        beforeData: null,
        afterData: { status: "OPEN" },
        context,
      });
    }
  }, "复核申请状态已变化，请刷新后重试");
  return getStudentExamReview(studentId, submissionId);
}

export async function resolveExamScoreReview(
  teacherId: string,
  assignmentId: string,
  reviewId: string,
  response: string,
  context: AuditRequestContext,
) {
  return runAssignmentSerializable(async (tx) => {
    const review = await tx.examScoreReview.findFirst({
      where: {
        id: reviewId,
        submission: {
          assignmentId,
          assignment: {
            teacherId,
            deletedAt: null,
            examSession: { teacherId },
          },
        },
      },
      select: { submissionId: true, resolvedAt: true, response: true },
    });
    if (!review) throw new ResourceNotFoundError("复核申请不存在");
    if (review.resolvedAt) {
      if (review.response === response) return { resolved: true };
      throw new AssignmentOperationError("该复核已处理，请刷新查看", 409);
    }
    const updated = await tx.examScoreReview.updateMany({
      where: { id: reviewId, resolvedAt: null },
      data: { response, resolvedAt: new Date() },
    });
    if (!updated.count)
      throw new AssignmentOperationError("该复核已处理，请刷新查看", 409);
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: "EXAM_SCORE_REVIEW_RESOLVED",
      targetType: "SUBMISSION",
      targetId: review.submissionId,
      summary: "回复考试成绩复核申请",
      beforeData: { status: "OPEN" },
      afterData: { status: "RESOLVED" },
      context,
    });
    return { resolved: true };
  }, "复核申请状态已变化，请刷新后重试");
}
