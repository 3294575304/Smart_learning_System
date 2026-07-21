import "server-only";

import {
  Prisma,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import { QuestionOperationError } from "@/services/questions/errors";
import type {
  DeleteQuestionResult,
  KnowledgePointOption,
  QuestionAnswer,
  QuestionDetail,
  QuestionListItem,
  QuestionListResult,
  QuestionReferenceCounts,
} from "@/services/questions/types";
import type {
  QuestionListQuery,
  QuestionUpsertData,
} from "@/services/questions/schemas";

const questionInclude = {
  creator: {
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true } },
    },
  },
  options: { orderBy: { sortOrder: "asc" as const } },
  knowledgePointLinks: {
    orderBy: { knowledgePoint: { name: "asc" as const } },
    select: {
      knowledgePoint: { select: { id: true, code: true, name: true } },
    },
  },
  _count: { select: { assignmentQuestions: true } },
} satisfies Prisma.QuestionInclude;

type QuestionRecord = Prisma.QuestionGetPayload<{
  include: typeof questionInclude;
}>;

function answerFromRecord(question: QuestionRecord): QuestionAnswer {
  if (
    question.type === QuestionType.SINGLE_CHOICE ||
    question.type === QuestionType.MULTIPLE_CHOICE
  ) {
    return {
      kind: "CHOICE",
      correctOptionLabels: question.options
        .filter((option) => option.isCorrect)
        .map((option) => option.label),
    };
  }
  if (question.type === QuestionType.TRUE_FALSE) {
    if (question.correctBoolean === null) {
      throw new QuestionOperationError("判断题标准答案缺失");
    }
    return { kind: "BOOLEAN", value: question.correctBoolean };
  }
  if (question.type === QuestionType.FILL_BLANK) {
    return {
      kind: "TEXT",
      acceptableAnswers: question.acceptableAnswers,
      caseSensitive: question.isCaseSensitive,
    };
  }
  if (!question.referenceAnswer) {
    throw new QuestionOperationError("简答题参考答案缺失");
  }
  return { kind: "REFERENCE", value: question.referenceAnswer };
}

function listItemFromRecord(
  teacherId: string,
  question: QuestionRecord,
): QuestionListItem {
  const isOwner = question.creatorId === teacherId;
  return {
    id: question.id,
    title: question.title,
    content: question.content,
    type: question.type,
    difficulty: question.difficulty,
    status: question.status,
    visibility: question.visibility,
    tags: question.tags,
    creator: {
      id: question.creator.id,
      displayName:
        question.creator.profile?.displayName ?? question.creator.email,
    },
    knowledgePoints: question.knowledgePointLinks.map(
      ({ knowledgePoint }) => knowledgePoint,
    ),
    assignmentReferenceCount: question._count.assignmentQuestions,
    canEdit: isOwner,
    canDelete: isOwner,
    canCopy: true,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}

function detailFromRecord(
  teacherId: string,
  question: QuestionRecord,
): QuestionDetail {
  return {
    ...listItemFromRecord(teacherId, question),
    explanation: question.explanation,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      content: option.content,
      sortOrder: option.sortOrder,
    })),
    answer: answerFromRecord(question),
  };
}

function persistenceFields(input: QuestionUpsertData) {
  const base = {
    title: input.title,
    content: input.content,
    type: input.type,
    difficulty: input.difficulty,
    visibility: input.visibility,
    status: QuestionStatus.ACTIVE,
    explanation: input.explanation,
    tags: input.tags,
    correctBoolean: null as boolean | null,
    referenceAnswer: null as string | null,
    acceptableAnswers: [] as string[],
    isCaseSensitive: false,
    gradingConfig: { mode: "EXACT_SET" } satisfies Prisma.InputJsonObject,
  };

  if (input.answer.kind === "BOOLEAN") {
    return {
      ...base,
      correctBoolean: input.answer.value,
      gradingConfig: { mode: "EXACT_BOOLEAN" },
    };
  }
  if (input.answer.kind === "TEXT") {
    return {
      ...base,
      acceptableAnswers: input.answer.acceptableAnswers,
      isCaseSensitive: input.answer.caseSensitive,
      gradingConfig: { mode: "EXACT_TEXT", trimWhitespace: true },
    };
  }
  if (input.answer.kind === "REFERENCE") {
    return {
      ...base,
      referenceAnswer: input.answer.value,
      gradingConfig: { mode: "MANUAL", manualReviewRequired: true },
    };
  }
  return base;
}

function optionCreateData(input: QuestionUpsertData) {
  if (input.answer.kind !== "CHOICE") {
    return [];
  }
  const correctLabels = new Set(input.answer.correctOptionLabels);
  return input.options.map((option) => ({
    label: option.label,
    content: option.content,
    sortOrder: option.sortOrder,
    isCorrect: correctLabels.has(option.label),
  }));
}

async function assertKnowledgePointsExist(
  transaction: Prisma.TransactionClient,
  knowledgePointIds: string[],
): Promise<void> {
  const count = await transaction.knowledgePoint.count({
    where: { id: { in: knowledgePointIds }, isActive: true },
  });
  if (count !== knowledgePointIds.length) {
    throw new QuestionOperationError("部分知识点不存在或已停用");
  }
}

async function findQuestionRecord(
  questionId: string,
): Promise<QuestionRecord | null> {
  return prisma.question.findFirst({
    where: {
      id: questionId,
      deletedAt: null,
      status: QuestionStatus.ACTIVE,
    },
    include: questionInclude,
  });
}

async function requireOwnedQuestion(
  teacherId: string,
  questionId: string,
): Promise<QuestionRecord> {
  const question = await findQuestionRecord(questionId);
  if (!question) {
    throw new ResourceNotFoundError("题目不存在");
  }
  if (question.creatorId !== teacherId) {
    if (question.visibility === QuestionVisibility.PUBLIC) {
      throw new AuthorizationError("公共题目只能查看或复制，不能直接修改");
    }
    throw new ResourceNotFoundError("题目不存在");
  }
  return question;
}

export async function listKnowledgePointOptions(): Promise<
  KnowledgePointOption[]
> {
  return prisma.knowledgePoint.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });
}

export async function listTeacherQuestions(
  teacherId: string,
  query: QuestionListQuery,
): Promise<QuestionListResult> {
  const where: Prisma.QuestionWhereInput = {
    deletedAt: null,
    status: QuestionStatus.ACTIVE,
    ...(query.scope === "OWNED"
      ? { creatorId: teacherId }
      : { visibility: QuestionVisibility.PUBLIC }),
    ...(query.keyword
      ? {
          OR: [
            { title: { contains: query.keyword, mode: "insensitive" } },
            { content: { contains: query.keyword, mode: "insensitive" } },
            { tags: { has: query.keyword } },
          ],
        }
      : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.knowledgePointId
      ? {
          knowledgePointLinks: {
            some: { knowledgePointId: query.knowledgePointId },
          },
        }
      : {}),
  };
  const [total, records] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      include: questionInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: records.map((question) => listItemFromRecord(teacherId, question)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getTeacherQuestion(
  teacherId: string,
  questionId: string,
): Promise<QuestionDetail> {
  const question = await findQuestionRecord(questionId);
  if (
    !question ||
    (question.creatorId !== teacherId &&
      question.visibility !== QuestionVisibility.PUBLIC)
  ) {
    throw new ResourceNotFoundError("题目不存在");
  }
  return detailFromRecord(teacherId, question);
}

export async function createQuestion(
  teacherId: string,
  input: QuestionUpsertData,
): Promise<QuestionDetail> {
  const questionId = await prisma.$transaction(async (transaction) => {
    await assertKnowledgePointsExist(transaction, input.knowledgePointIds);
    const question = await transaction.question.create({
      data: {
        creatorId: teacherId,
        ...persistenceFields(input),
        options: { create: optionCreateData(input) },
        knowledgePointLinks: {
          create: input.knowledgePointIds.map((knowledgePointId) => ({
            knowledgePointId,
            weight: 1,
          })),
        },
      },
      select: { id: true },
    });
    return question.id;
  });
  return getTeacherQuestion(teacherId, questionId);
}

export async function updateQuestion(
  teacherId: string,
  questionId: string,
  input: QuestionUpsertData,
): Promise<QuestionDetail> {
  await requireOwnedQuestion(teacherId, questionId);
  await prisma.$transaction(async (transaction) => {
    await assertKnowledgePointsExist(transaction, input.knowledgePointIds);
    await transaction.questionOption.deleteMany({ where: { questionId } });
    await transaction.questionKnowledgePoint.deleteMany({
      where: { questionId },
    });
    await transaction.question.update({
      where: { id: questionId },
      data: {
        ...persistenceFields(input),
        options: { create: optionCreateData(input) },
        knowledgePointLinks: {
          create: input.knowledgePointIds.map((knowledgePointId) => ({
            knowledgePointId,
            weight: 1,
          })),
        },
      },
    });
  });
  return getTeacherQuestion(teacherId, questionId);
}

export async function copyQuestion(
  teacherId: string,
  sourceQuestionId: string,
): Promise<QuestionDetail> {
  const source = await findQuestionRecord(sourceQuestionId);
  if (
    !source ||
    (source.creatorId !== teacherId &&
      source.visibility !== QuestionVisibility.PUBLIC)
  ) {
    throw new ResourceNotFoundError("题目不存在");
  }
  const copiedId = await prisma.$transaction(async (transaction) => {
    const copy = await transaction.question.create({
      data: {
        creatorId: teacherId,
        title: `${source.title}（副本）`,
        content: source.content,
        type: source.type,
        difficulty: source.difficulty,
        visibility: QuestionVisibility.PRIVATE,
        status: QuestionStatus.ACTIVE,
        explanation: source.explanation,
        tags: source.tags,
        correctBoolean: source.correctBoolean,
        referenceAnswer: source.referenceAnswer,
        acceptableAnswers: source.acceptableAnswers,
        isCaseSensitive: source.isCaseSensitive,
        gradingConfig:
          source.gradingConfig === null
            ? Prisma.JsonNull
            : source.gradingConfig,
        options: {
          create: source.options.map((option) => ({
            label: option.label,
            content: option.content,
            isCorrect: option.isCorrect,
            sortOrder: option.sortOrder,
          })),
        },
        knowledgePointLinks: {
          create: source.knowledgePointLinks.map(({ knowledgePoint }) => ({
            knowledgePointId: knowledgePoint.id,
            weight: 1,
          })),
        },
      },
      select: { id: true },
    });
    return copy.id;
  });
  return getTeacherQuestion(teacherId, copiedId);
}

async function referenceCounts(
  transaction: Prisma.TransactionClient,
  questionId: string,
): Promise<QuestionReferenceCounts> {
  const [assignments, recommendations, tutoringRecords] = await Promise.all([
    transaction.assignmentQuestion.count({ where: { questionId } }),
    transaction.personalizedRecommendation.count({ where: { questionId } }),
    transaction.aITutoringRecord.count({ where: { questionId } }),
  ]);
  return { assignments, recommendations, tutoringRecords };
}

function hasReferences(references: QuestionReferenceCounts): boolean {
  return Object.values(references).some((count) => count > 0);
}

export async function deleteQuestion(
  teacherId: string,
  questionId: string,
): Promise<DeleteQuestionResult> {
  await requireOwnedQuestion(teacherId, questionId);
  try {
    return await prisma.$transaction(async (transaction) => {
      const references = await referenceCounts(transaction, questionId);
      if (hasReferences(references)) {
        await transaction.question.update({
          where: { id: questionId },
          data: { status: QuestionStatus.ARCHIVED, deletedAt: new Date() },
        });
        return { questionId, mode: "ARCHIVED", references };
      }
      await transaction.question.delete({ where: { id: questionId } });
      return { questionId, mode: "PHYSICAL", references };
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      const references = await prisma.$transaction((transaction) =>
        referenceCounts(transaction, questionId),
      );
      await prisma.question.update({
        where: { id: questionId },
        data: { status: QuestionStatus.ARCHIVED, deletedAt: new Date() },
      });
      return { questionId, mode: "ARCHIVED", references };
    }
    throw error;
  }
}
