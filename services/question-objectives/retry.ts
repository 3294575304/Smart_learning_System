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
) {
  const question = await prisma.question.findFirst({
    where: {
      id: questionId,
      ...teacherQuestionAccessWhere(teacherId),
      deletedAt: null,
      status: { in: ["ACTIVE", "DRAFT"] },
    },
    select: {
      id: true,
      revision: true,
      questionCategoryId: true,
      defaultObjectiveKind: true,
    },
  });
  if (!question) throw new ResourceNotFoundError("题目不存在");

  let syllabusStructureId: string | null = null;
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
    const existing = await prisma.questionCourseObjective.findUnique({
      where: {
        questionId_courseId_syllabusStructureId: {
          questionId,
          courseId,
          syllabusStructureId,
        },
      },
      select: { id: true },
    });
    if (existing) return { status: "CLASSIFIED" as const };
  } else if (question.defaultObjectiveKind) {
    return { status: "CLASSIFIED" as const };
  }

  const job = await createBackgroundJob({
    type: QUESTION_OBJECTIVE_JOB_TYPE,
    idempotencyKey: `${questionId}:retry:${requestId}`,
    requestedById: teacherId,
    courseId,
    input: {
      questionId,
      revision: question.revision,
      courseId,
      syllabusStructureId,
    },
    maxAttempts: 3,
  });
  return { status: "QUEUED" as const, jobId: job.id };
}
