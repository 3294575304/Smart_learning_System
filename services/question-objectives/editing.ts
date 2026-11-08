import "server-only";

import { AuditAction, AuditTargetType, QuestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { QuestionOperationError } from "@/services/questions/errors";
import { teacherQuestionAccessWhere } from "@/services/questions/access";
import { storedPublishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";

export async function listQuestionObjectiveCourses(
  teacherId: string,
  questionId: string,
) {
  const question = await prisma.question.findFirst({
    where: {
      id: questionId,
      ...teacherQuestionAccessWhere(teacherId),
      deletedAt: null,
      status: { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] },
    },
    select: { id: true, questionCategoryId: true },
  });
  if (!question) throw new ResourceNotFoundError("题目不存在");
  if (!question.questionCategoryId) return [];
  const courses = await prisma.course.findMany({
    where: {
      teacherId,
      questionCategoryId: question.questionCategoryId,
      status: { not: "ARCHIVED" },
      currentPublishedSyllabusStructureId: { not: null },
    },
    select: {
      id: true,
      name: true,
      term: true,
      currentPublishedSyllabusStructureId: true,
      currentPublishedSyllabusStructure: {
        select: { versionNumber: true, structureJson: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  const mappings = await prisma.questionCourseObjective.findMany({
    where: { questionId, courseId: { in: courses.map(({ id }) => id) } },
    select: { courseId: true, syllabusStructureId: true, objectiveCode: true },
  });
  return courses.flatMap((course) => {
    const parsed = storedPublishableSyllabusStructureSchema.safeParse(
      course.currentPublishedSyllabusStructure?.structureJson,
    );
    if (!parsed.success || !course.currentPublishedSyllabusStructureId)
      return [];
    return [
      {
        courseId: course.id,
        name: course.name,
        term: course.term,
        syllabusStructureId: course.currentPublishedSyllabusStructureId,
        versionNumber:
          course.currentPublishedSyllabusStructure?.versionNumber ?? 0,
        objectives: parsed.data.objectives.map(({ code, title }) => ({
          code,
          title,
        })),
        objectiveCode:
          mappings.find(
            (item) =>
              item.courseId === course.id &&
              item.syllabusStructureId ===
                course.currentPublishedSyllabusStructureId,
          )?.objectiveCode ?? null,
      },
    ];
  });
}

export async function saveQuestionCourseObjective(
  teacherId: string,
  questionId: string,
  input: {
    courseId: string;
    syllabusStructureId: string;
    objectiveCode: string;
    expectedObjectiveCode: string | null;
  },
  context: AuditRequestContext,
) {
  return runAssignmentSerializable(async (tx) => {
    const course = await tx.course.findFirst({
      where: {
        id: input.courseId,
        teacherId,
        status: { not: "ARCHIVED" },
        currentPublishedSyllabusStructureId: input.syllabusStructureId,
      },
      select: {
        questionCategoryId: true,
        currentPublishedSyllabusStructure: { select: { structureJson: true } },
      },
    });
    if (!course) throw new ResourceNotFoundError("课程不存在或大纲版本已变化");
    const question = await tx.question.findFirst({
      where: {
        id: questionId,
        ...teacherQuestionAccessWhere(teacherId),
        deletedAt: null,
        status: { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] },
        questionCategoryId: course.questionCategoryId,
        isAssignmentOnly: false,
      },
      select: { id: true, title: true },
    });
    if (!question) throw new ResourceNotFoundError("题目不存在");
    const syllabus = storedPublishableSyllabusStructureSchema.safeParse(
      course.currentPublishedSyllabusStructure?.structureJson,
    );
    if (
      !syllabus.success ||
      !syllabus.data.objectives.some(({ code }) => code === input.objectiveCode)
    )
      throw new QuestionOperationError("课程目标不在当前正式大纲中");
    const key = {
      questionId,
      courseId: input.courseId,
      syllabusStructureId: input.syllabusStructureId,
    };
    const existing = await tx.questionCourseObjective.findUnique({
      where: { questionId_courseId_syllabusStructureId: key },
      select: { objectiveCode: true },
    });
    if ((existing?.objectiveCode ?? null) !== input.expectedObjectiveCode)
      throw new QuestionOperationError("课程目标已被修改，请刷新后重试", 409);
    const saved = await tx.questionCourseObjective.upsert({
      where: { questionId_courseId_syllabusStructureId: key },
      create: { ...key, objectiveCode: input.objectiveCode, source: "TEACHER" },
      update: { objectiveCode: input.objectiveCode, source: "TEACHER" },
      select: { objectiveCode: true },
    });
    await writeGovernanceAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.QUESTION_UPDATED,
      targetType: AuditTargetType.QUESTION,
      targetId: questionId,
      summary: `设置题目课程目标：${question.title}`,
      beforeData: {
        courseId: input.courseId,
        syllabusStructureId: input.syllabusStructureId,
        objectiveCode: existing?.objectiveCode ?? null,
      },
      afterData: {
        courseId: input.courseId,
        syllabusStructureId: input.syllabusStructureId,
        objectiveCode: saved.objectiveCode,
      },
      context,
    });
    return saved;
  }, "课程目标已被其他页面修改，请刷新后重试");
}
