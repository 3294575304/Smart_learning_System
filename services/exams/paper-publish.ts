import "server-only";

import { AuditAction, AuditTargetType, QuestionStatus } from "@prisma/client";

import { AssignmentOperationError } from "@/services/assignments/errors";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { createProgrammingConfigInTransaction } from "@/services/programming-questions/service";
import { storedPublishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";
import {
  optionCreateData,
  persistenceFields,
} from "@/services/question-import/service";
import {
  questionUpsertSchema,
  type QuestionUpsertData,
} from "@/services/questions/schemas";
import { examQuestionHash } from "./fingerprint";
import { examCreateSchema } from "./schemas";
import { createExamSessionInTransaction } from "./service";
import {
  paperDraftPublishSchema,
  paperDraftQuestionSchema,
} from "./paper-schemas";

type CandidateImage = { checksum: string; sortOrder: number };

function candidateHash(question: QuestionUpsertData, images: CandidateImage[]) {
  const correct =
    question.answer.kind === "CHOICE"
      ? new Set(question.answer.correctOptionLabels)
      : new Set<string>();
  return examQuestionHash({
    type: question.type,
    content: question.content,
    options: question.options.map((option) => ({
      content: option.content,
      sortOrder: option.sortOrder,
      isCorrect: correct.has(option.label),
    })),
    correctBoolean:
      question.answer.kind === "BOOLEAN" ? question.answer.value : null,
    referenceAnswer:
      question.answer.kind === "REFERENCE" ? question.answer.value : null,
    acceptableAnswers:
      question.answer.kind === "TEXT" ? question.answer.acceptableAnswers : [],
    examImages: images,
  });
}

function sameStem(
  a: {
    type: string;
    content: string;
    options: Array<{ content: string; sortOrder: number }>;
  },
  b: {
    type: string;
    content: string;
    options: Array<{ content: string; sortOrder: number }>;
  },
) {
  const normalize = (value: string) =>
    value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
  return (
    a.type === b.type &&
    normalize(a.content) === normalize(b.content) &&
    JSON.stringify(
      [...a.options]
        .sort((x, y) => x.sortOrder - y.sortOrder)
        .map((option) => normalize(option.content)),
    ) ===
      JSON.stringify(
        [...b.options]
          .sort((x, y) => x.sortOrder - y.sortOrder)
          .map((option) => normalize(option.content)),
      )
  );
}

export async function publishPaperDraft(
  teacherId: string,
  draftId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const input = paperDraftPublishSchema.parse(raw);
  return runAssignmentSerializable(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ExamPaperDraft" WHERE id = ${draftId} FOR UPDATE`;
      const draft = await tx.examPaperDraft.findFirst({
        where: { id: draftId, teacherId },
        include: {
          questions: {
            orderBy: { ordinal: "asc" },
            include: {
              assets: {
                where: { kind: "QUESTION_CROP", isActive: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      });
      if (!draft) throw new ResourceNotFoundError("考试草稿不存在");
      if (draft.publishedExamId) {
        const published = await tx.examSession.findUnique({
          where: { id: draft.publishedExamId },
          include: { assignments: true },
        });
        if (published?.requestId === input.requestId) return published;
        throw new AssignmentOperationError("该草稿已发布", 409);
      }
      if (draft.status !== "READY" || draft.revision !== input.expectedRevision)
        throw new AssignmentOperationError("草稿已变化，请刷新后重试", 409);
      if (
        !draft.startsAt ||
        !draft.endsAt ||
        !draft.title.trim() ||
        !draft.classroomIds.length
      )
        throw new AssignmentOperationError("请先设置考试名称、时间和班级", 400);
      if (draft.questions.length < 1 || draft.questions.length > 200)
        throw new AssignmentOperationError("试卷题量必须为 1 至 200 道", 400);
      if (draft.classroomIds.length * draft.questions.length > 400)
        throw new AssignmentOperationError("跨班发布最多复制 400 题次", 400);
      await tx.$queryRaw`SELECT id FROM "QuestionCourseCategory" WHERE id = ${draft.questionCategoryId} FOR UPDATE`;
      const course = await tx.course.findFirst({
        where: {
          id: draft.courseId,
          teacherId,
          questionCategoryId: draft.questionCategoryId,
          status: { not: "ARCHIVED" },
          questionCategory: { isActive: true },
        },
        select: {
          id: true,
          currentPublishedSyllabusStructureId: true,
          currentPublishedSyllabusStructure: {
            select: { structureJson: true },
          },
        },
      });
      if (!course) throw new ResourceNotFoundError("课程不存在");
      const syllabus = storedPublishableSyllabusStructureSchema.safeParse(
        course.currentPublishedSyllabusStructure?.structureJson,
      );
      if (!course.currentPublishedSyllabusStructureId || !syllabus.success)
        throw new AssignmentOperationError("请先发布课程教学大纲", 409);
      const objectiveCodes = new Set(
        syllabus.data.objectives.map((objective) => objective.code),
      );
      const existing = await tx.question.findMany({
        where: {
          questionCategoryId: draft.questionCategoryId,
          status: QuestionStatus.ACTIVE,
          deletedAt: null,
          isAssignmentOnly: false,
        },
        include: { options: true, examImages: true },
      });
      const existingByHash = new Map(
        existing.map((question) => [examQuestionHash(question), question]),
      );
      const selectedHashes = new Set<string>();
      const selected: Array<{
        questionId: string;
        points: number;
        objectiveCode: string;
      }> = [];
      for (const row of draft.questions) {
        if (row.reviewedRevision !== row.revision)
          throw new AssignmentOperationError(
            `第 ${row.ordinal} 题尚未审核`,
            400,
          );
        const draftQuestion = paperDraftQuestionSchema.parse(row.questionJson);
        const objectiveCode = draftQuestion.objectiveCodes[0];
        if (
          draftQuestion.objectiveCodes.length !== 1 ||
          !objectiveCodes.has(objectiveCode)
        )
          throw new AssignmentOperationError(
            `第 ${row.ordinal} 题课程目标无效，请重新审核`,
            400,
          );
        const validated = questionUpsertSchema.safeParse({
          ...draftQuestion,
          questionCategoryId: draft.questionCategoryId,
          knowledgePointIds: [],
          tags: draftQuestion.tags.length ? draftQuestion.tags : ["试卷导入"],
        });
        if (!validated.success)
          throw new AssignmentOperationError(
            `第 ${row.ordinal} 题内容无效：${validated.error.issues[0]?.message ?? "请检查"}`,
            400,
          );
        const question = validated.data;
        if (
          question.type === "PYTHON_PROGRAMMING" &&
          !draftQuestion.programmingConfig
        )
          throw new AssignmentOperationError(
            `第 ${row.ordinal} 题缺少判题配置`,
            400,
          );
        const images = row.assets.map((image, index) => ({
          checksum: image.checksum,
          sortOrder: index + 1,
        }));
        const hash = candidateHash(question, images);
        if (selectedHashes.has(hash))
          throw new AssignmentOperationError("同一试卷不能包含相同题目", 400);
        selectedHashes.add(hash);
        let bankQuestion = existingByHash.get(hash);
        if (
          !bankQuestion &&
          existing.some(
            (item) =>
              sameStem(item, question) &&
              [...item.examImages]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((image) => image.checksum)
                .join("|") === images.map((image) => image.checksum).join("|"),
          )
        )
          throw new AssignmentOperationError(
            `第 ${row.ordinal} 题与题库同题答案冲突，请核对`,
            409,
          );
        if (!bankQuestion) {
          const created = await tx.question.create({
            data: {
              creatorId: teacherId,
              ...persistenceFields(question),
              options: { create: optionCreateData(question) },
              examImages: {
                create: row.assets.map((image, index) => ({
                  sortOrder: index + 1,
                  storageKey: image.storageKey,
                  checksum: image.checksum,
                  mimeType: image.mimeType,
                  width: image.width,
                  height: image.height,
                })),
              },
            },
            include: { options: true, examImages: true },
          });
          if (
            question.type === "PYTHON_PROGRAMMING" &&
            draftQuestion.programmingConfig
          )
            await createProgrammingConfigInTransaction(
              tx,
              teacherId,
              created.id,
              draftQuestion.programmingConfig,
              context,
            );
          bankQuestion = created;
          existingByHash.set(hash, created);
        }
        selected.push({
          questionId: bankQuestion.id,
          points: Number(row.points),
          objectiveCode,
        });
      }
      const examInput = examCreateSchema.parse({
        requestId: input.requestId,
        courseId: draft.courseId,
        classroomIds: draft.classroomIds,
        type: draft.type,
        title: draft.title,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        allowedSwitches: draft.allowedSwitches,
        questions: selected.map(({ questionId, points }) => ({
          questionId,
          points,
        })),
      });
      const exam = await createExamSessionInTransaction(
        tx,
        teacherId,
        examInput,
        context,
      );
      for (const item of selected) {
        await tx.questionCourseObjective.upsert({
          where: {
            questionId_courseId_syllabusStructureId: {
              questionId: item.questionId,
              courseId: draft.courseId,
              syllabusStructureId: course.currentPublishedSyllabusStructureId,
            },
          },
          create: {
            questionId: item.questionId,
            courseId: draft.courseId,
            syllabusStructureId: course.currentPublishedSyllabusStructureId,
            objectiveCode: item.objectiveCode,
            source: "TEACHER",
          },
          update: { objectiveCode: item.objectiveCode, source: "TEACHER" },
        });
        await tx.examQuestionUse.update({
          where: {
            examSessionId_questionId: {
              examSessionId: exam.id,
              questionId: item.questionId,
            },
          },
          data: {
            objectiveCode: item.objectiveCode,
            syllabusStructureId: course.currentPublishedSyllabusStructureId,
          },
        });
      }
      await tx.examPaperDraft.update({
        where: { id: draft.id },
        data: {
          status: "PUBLISHED",
          publishedExamId: exam.id,
        },
      });
      await writeTeachingAuditLog(tx, {
        actorId: teacherId,
        action: AuditAction.EXAM_DRAFT_REVIEWED,
        targetType: AuditTargetType.EXAM_DRAFT,
        targetId: draft.id,
        summary: "审核试卷并发布考试",
        beforeData: { revision: draft.revision },
        afterData: { examId: exam.id, questionCount: selected.length },
        context,
      });
      return exam;
    },
    "考试发布发生并发冲突，请刷新后重试",
    60_000,
  );
}
