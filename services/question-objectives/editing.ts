import "server-only";

import {
  AuditAction,
  AuditTargetType,
  Prisma,
  QuestionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { QuestionOperationError } from "@/services/questions/errors";
import { teacherQuestionAccessWhere } from "@/services/questions/access";
import { storedPublishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";

type ObjectiveScope = { courseId: string; syllabusStructureId: string };

export async function appendQuestionObjectiveInTransaction(
  tx: Prisma.TransactionClient,
  key: ObjectiveScope & { questionId: string },
  objectiveCode: string,
  onlyIfUnlabeled = false,
) {
  const existing = await tx.questionCourseObjective.findMany({
    where: key,
    select: { objectiveCode: true },
    orderBy: { objectiveCode: "asc" },
  });
  const previous = existing.map((item) => item.objectiveCode);
  if (previous.includes(objectiveCode) || (onlyIfUnlabeled && previous.length))
    return { status: "unchanged" as const };
  if (previous.length >= 3) return { status: "limitReached" as const };

  // Advance the revision so a previously queued classifier cannot overwrite this decision.
  await tx.question.update({
    where: { id: key.questionId },
    data: { revision: { increment: 1 } },
    select: { id: true },
  });
  await tx.questionCourseObjective.create({
    data: { ...key, objectiveCode, source: "TEACHER" },
  });
  return {
    status: "added" as const,
    previous,
    objectiveCodes: [...previous, objectiveCode].sort(),
  };
}

export async function appendQuestionCourseObjectiveBatch(
  teacherId: string,
  input: ObjectiveScope & { questionIds: string[]; objectiveCode: string },
  context: AuditRequestContext,
) {
  const { courseId, syllabusStructureId, objectiveCode, questionIds } = input;
  const scope = { courseId, syllabusStructureId };
  return runAssignmentSerializable(
    async (tx) => {
      const course = await tx.course.findFirst({
        where: {
          id: courseId,
          teacherId,
          status: { not: "ARCHIVED" },
          currentPublishedSyllabusStructureId: syllabusStructureId,
        },
        select: {
          questionCategoryId: true,
          currentPublishedSyllabusStructure: {
            select: { structureJson: true },
          },
        },
      });
      if (!course)
        throw new ResourceNotFoundError("课程不存在或大纲版本已变化");
      const syllabus = storedPublishableSyllabusStructureSchema.safeParse(
        course.currentPublishedSyllabusStructure?.structureJson,
      );
      if (
        !syllabus.success ||
        !syllabus.data.objectives.some(({ code }) => code === objectiveCode)
      )
        throw new QuestionOperationError("课程目标不在当前正式大纲中");

      const questions = await tx.question.findMany({
        where: {
          id: { in: questionIds },
          ...teacherQuestionAccessWhere(teacherId),
          deletedAt: null,
          status: { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] },
          questionCategoryId: course.questionCategoryId,
          isAssignmentOnly: false,
        },
        select: { id: true, title: true },
        orderBy: { id: "asc" },
      });
      if (questions.length !== questionIds.length)
        throw new ResourceNotFoundError("部分题目已不可用，请刷新后重试");

      const counts = { added: 0, unchanged: 0, limitReached: 0 };
      for (const question of questions) {
        const result = await appendQuestionObjectiveInTransaction(
          tx,
          { ...scope, questionId: question.id },
          objectiveCode,
        );
        counts[result.status] += 1;
        if (result.status !== "added") continue;
        await writeGovernanceAuditLog(tx, {
          actorId: teacherId,
          action: AuditAction.QUESTION_UPDATED,
          targetType: AuditTargetType.QUESTION,
          targetId: question.id,
          summary: `批量追加题目课程目标：${question.title}`,
          beforeData: { ...scope, objectiveCodes: result.previous },
          afterData: { ...scope, objectiveCodes: result.objectiveCodes },
          context,
        });
      }
      return counts;
    },
    "课程目标已被其他页面修改，请刷新后重试",
    15_000,
  );
}

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
    select: {
      courseId: true,
      syllabusStructureId: true,
      objectiveCode: true,
      source: true,
    },
  });
  return courses.flatMap((course) => {
    const parsed = storedPublishableSyllabusStructureSchema.safeParse(
      course.currentPublishedSyllabusStructure?.structureJson,
    );
    if (!parsed.success || !course.currentPublishedSyllabusStructureId)
      return [];
    const currentMappings = mappings.filter(
      (item) =>
        item.courseId === course.id &&
        item.syllabusStructureId === course.currentPublishedSyllabusStructureId,
    );
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
        objectiveCodes: currentMappings
          .map((item) => item.objectiveCode)
          .sort(),
        aiObjectiveCodes: currentMappings
          .filter((item) => item.source === "AI")
          .map((item) => item.objectiveCode),
      },
    ];
  });
}

export async function saveQuestionCourseObjective(
  teacherId: string,
  questionId: string,
  input: { courseId: string; syllabusStructureId: string } & (
    | { objectiveCodes: string[]; expectedObjectiveCodes: string[] }
    | { objectiveCode: string; expectedObjectiveCode: string | null }
  ),
  context: AuditRequestContext,
) {
  const codes = (
    "objectiveCodes" in input
      ? [...input.objectiveCodes]
      : [input.objectiveCode]
  ).sort();
  const expected = (
    "expectedObjectiveCodes" in input
      ? [...input.expectedObjectiveCodes]
      : input.expectedObjectiveCode
        ? [input.expectedObjectiveCode]
        : []
  ).sort();
  if (codes.length > 3 || new Set(codes).size !== codes.length)
    throw new QuestionOperationError("每题最多设置三个不同的课程目标");
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
      codes.some(
        (target) =>
          !syllabus.data.objectives.some(({ code }) => code === target),
      )
    )
      throw new QuestionOperationError("课程目标不在当前正式大纲中");
    const key = {
      questionId,
      courseId: input.courseId,
      syllabusStructureId: input.syllabusStructureId,
    };
    const existing = await tx.questionCourseObjective.findMany({
      where: key,
      orderBy: { objectiveCode: "asc" },
      select: { objectiveCode: true },
    });
    const previous = existing.map((item) => item.objectiveCode).sort();
    if (JSON.stringify(previous) !== JSON.stringify(expected))
      throw new QuestionOperationError("课程目标已被修改，请刷新后重试", 409);
    await tx.question.update({
      where: { id: questionId },
      data: { revision: { increment: 1 } },
      select: { id: true },
    });
    await tx.questionCourseObjective.deleteMany({
      where: { ...key, objectiveCode: { notIn: codes } },
    });
    if (codes.length) {
      await tx.questionCourseObjective.updateMany({
        where: { ...key, objectiveCode: { in: codes } },
        data: { source: "TEACHER" },
      });
      await tx.questionCourseObjective.createMany({
        data: codes
          .filter((objectiveCode) => !previous.includes(objectiveCode))
          .map((objectiveCode) => ({
            ...key,
            objectiveCode,
            source: "TEACHER",
          })),
      });
    }
    await writeGovernanceAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.QUESTION_UPDATED,
      targetType: AuditTargetType.QUESTION,
      targetId: questionId,
      summary: `设置题目课程目标：${question.title}`,
      beforeData: {
        courseId: input.courseId,
        syllabusStructureId: input.syllabusStructureId,
        objectiveCodes: previous,
      },
      afterData: {
        courseId: input.courseId,
        syllabusStructureId: input.syllabusStructureId,
        objectiveCodes: codes,
      },
      context,
    });
    return {
      objectiveCodes: codes,
      // Only legacy single-code requests receive the deprecated response field.
      ...("objectiveCode" in input
        ? { objectiveCode: input.objectiveCode }
        : {}),
    };
  }, "课程目标已被其他页面修改，请刷新后重试");
}
