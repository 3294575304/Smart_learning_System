import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { createBackgroundJob } from "@/services/background-jobs/repository";
import { teacherQuestionAccessWhere } from "@/services/questions/access";
import { QUESTION_OBJECTIVE_JOB_TYPE } from "./schemas";

export async function retryQuestionObjectiveClassification(
  teacherId: string,
  questionId: string,
  courseId: string | null,
  requestId: string,
  reclassify = false,
) {
  const question = await prisma.question.findFirst({
    where: {
      id: questionId,
      ...teacherQuestionAccessWhere(teacherId),
      deletedAt: null,
      status: { in: ["ACTIVE", "DRAFT"] },
      ...(reclassify ? { isAssignmentOnly: false } : {}),
    },
    select: {
      id: true,
      revision: true,
      questionCategoryId: true,
      defaultObjectiveKind: true,
    },
  });
  if (!question) throw new ResourceNotFoundError("题目不存在");

  if (reclassify && !courseId) return { status: "PROTECTED" as const };
  const requestKey = reclassify
    ? `${questionId}:reclassify:${courseId}:${teacherId}:${requestId}`
    : `${questionId}:retry:${requestId}`;
  let syllabusStructureId: string | null = null;
  let replacement: { id: string; updatedAt: string } | undefined;
  if (courseId) {
    if (!question.questionCategoryId)
      throw new ResourceNotFoundError("题目尚未归属课程分类");
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        teacherId,
        status: { not: "ARCHIVED" },
        questionCategoryId: question.questionCategoryId,
        currentPublishedSyllabusStructureId: { not: null },
      },
      select: { currentPublishedSyllabusStructureId: true },
    });
    if (!course || course.currentPublishedSyllabusStructureId === null)
      throw new ResourceNotFoundError("课程不存在或尚无正式大纲");
    syllabusStructureId = course.currentPublishedSyllabusStructureId;
    if (reclassify) {
      const prior = await prisma.backgroundJob.findUnique({
        where: {
          type_idempotencyKey: {
            type: QUESTION_OBJECTIVE_JOB_TYPE,
            idempotencyKey: requestKey,
          },
        },
        select: { id: true },
      });
      if (prior) return { status: "QUEUED" as const, jobId: prior.id };
    }
    const existing = await prisma.questionCourseObjective.findMany({
      where: {
        questionId,
        courseId,
        syllabusStructureId,
      },
      select: { id: true, source: true, updatedAt: true },
      take: 2,
    });
    if (reclassify) {
      const [mapping] = existing;
      if (existing.length !== 1 || mapping?.source !== "AI")
        return { status: "PROTECTED" as const };
      replacement = {
        id: mapping.id,
        updatedAt: mapping.updatedAt.toISOString(),
      };
    } else if (existing.length) {
      return { status: "CLASSIFIED" as const };
    }
  } else if (question.defaultObjectiveKind) {
    return { status: "CLASSIFIED" as const };
  }

  const job = await createBackgroundJob({
    type: QUESTION_OBJECTIVE_JOB_TYPE,
    idempotencyKey: requestKey,
    requestedById: teacherId,
    courseId,
    input: {
      questionId,
      revision: question.revision,
      courseId,
      syllabusStructureId,
      ...(replacement ? { replacement } : {}),
    },
    maxAttempts: 3,
  });
  return { status: "QUEUED" as const, jobId: job.id };
}
