import "server-only";

import {
  Prisma,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { orderedCourseConceptOptions } from "@/services/questions/course-concept-options";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import { QuestionOperationError } from "@/services/questions/errors";
import {
  canTeacherCopyQuestion,
  assertTeacherCanEditQuestion,
  assertTeacherQuestionIsPrivate,
} from "@/services/questions/policy";
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
      weight: true,
      knowledgePoint: { select: { id: true, code: true, name: true } },
    },
  },
  _count: { select: { assignmentQuestions: true } },
} satisfies Prisma.QuestionInclude;

type QuestionRecord = Prisma.QuestionGetPayload<{
  include: typeof questionInclude;
}>;

function answerFromRecord(question: QuestionRecord): QuestionAnswer {
  if (question.type === QuestionType.PYTHON_PROGRAMMING) {
    return { kind: "PROGRAMMING" };
  }
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
    canEdit: isOwner && question.visibility === QuestionVisibility.PRIVATE,
    canDelete: isOwner && question.visibility === QuestionVisibility.PRIVATE,
    canCopy: canTeacherCopyQuestion(teacherId, question),
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
    isAssignmentOnly: false,
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
  if (input.answer.kind === "PROGRAMMING") {
    return {
      ...base,
      gradingConfig: {
        mode: "ASYNC_PROGRAMMING",
        configStoredSeparately: true,
      },
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
      status: { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] },
      isAssignmentOnly: false,
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

export async function listTeacherQuestionCourseOptions(teacherId: string) {
  const courses = await prisma.course.findMany({
    where: {
      teacherId,
      status: { not: "ARCHIVED" },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      templateId: true,
      name: true,
      courseNo: true,
      term: true,
      classrooms: { orderBy: { name: "asc" }, select: { name: true } },
      currentPublishedKnowledgeGraphVersion: {
        select: {
          nodes: {
            where: { nodeType: { in: ["CHAPTER", "KNOWLEDGE_POINT"] } },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              conceptId: true,
              code: true,
              name: true,
              nodeType: true,
              sortOrder: true,
            },
          },
          edges: {
            where: { relationType: "CONTAINS" },
            select: { fromNodeId: true, toNodeId: true },
          },
        },
      },
    },
  });
  const groups = new Map<
    string,
    {
      id: string;
      courseIds: string[];
      name: string;
      courseNo: string;
      term: string;
      classrooms: string[];
      concepts: Map<
        string,
        ReturnType<typeof orderedCourseConceptOptions>[number]
      >;
    }
  >();
  for (const course of courses) {
    const key = [
      course.templateId,
      course.courseNo,
      course.name,
      course.term,
    ].join("\u0000");
    let group = groups.get(key);
    if (!group) {
      group = {
        id: course.id,
        courseIds: [],
        name: course.name,
        courseNo: course.courseNo,
        term: course.term,
        classrooms: [],
        concepts: new Map(),
      };
      groups.set(key, group);
    }
    group.courseIds.push(course.id);
    group.classrooms.push(
      ...course.classrooms.map((classroom) => classroom.name),
    );
    const graph = course.currentPublishedKnowledgeGraphVersion;
    for (const concept of graph
      ? orderedCourseConceptOptions(graph.nodes, graph.edges)
      : []) {
      const conceptKey = concept.code;
      if (!group.concepts.has(conceptKey))
        group.concepts.set(conceptKey, {
          conceptId: `CODE:${concept.code}`,
          code: concept.code,
          name: concept.name,
          chapterName: concept.chapterName,
          chapterOrder: concept.chapterOrder,
          sortOrder: concept.sortOrder,
        });
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    courseIds: [...group.courseIds],
    classrooms: [...group.classrooms],
    concepts: [...group.concepts.values()].sort(
      (a, b) =>
        a.chapterOrder - b.chapterOrder ||
        a.sortOrder - b.sortOrder ||
        a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
    ),
  }));
}

export async function listTeacherQuestions(
  teacherId: string,
  query: QuestionListQuery,
): Promise<QuestionListResult> {
  let courseGraphConceptIds: string[] | undefined;
  let courseIds: string[] = [];
  if (query.courseId) {
    const selectedCourse = await prisma.course.findFirst({
      where: {
        id: query.courseId,
        teacherId,
        status: { not: "ARCHIVED" },
      },
      select: { templateId: true, courseNo: true, name: true, term: true },
    });
    if (!selectedCourse)
      throw new ResourceNotFoundError("课程不存在或无权访问");
    const courseGroup = await prisma.course.findMany({
      where: {
        teacherId,
        templateId: selectedCourse.templateId,
        courseNo: selectedCourse.courseNo,
        name: selectedCourse.name,
        term: selectedCourse.term,
        status: { not: "ARCHIVED" },
      },
      select: {
        id: true,
        currentPublishedKnowledgeGraphVersion: {
          select: {
            nodes: {
              where: { nodeType: "KNOWLEDGE_POINT" },
              select: { conceptId: true, code: true },
            },
          },
        },
      },
    });
    courseIds = courseGroup.map((item) => item.id);
    const concepts = courseGroup.flatMap(
      (item) => item.currentPublishedKnowledgeGraphVersion?.nodes ?? [],
    );
    courseGraphConceptIds = concepts.map((node) => node.conceptId);
    if (query.courseConceptId?.startsWith("CODE:")) {
      const code = query.courseConceptId.slice("CODE:".length);
      const selectedConceptIds = concepts
        .filter((concept) => concept.code === code)
        .map((concept) => concept.conceptId);
      if (!selectedConceptIds.length)
        throw new ResourceNotFoundError("课程知识点不存在");
      courseGraphConceptIds = selectedConceptIds;
    } else if (
      query.courseConceptId &&
      !courseGraphConceptIds.includes(query.courseConceptId)
    ) {
      throw new ResourceNotFoundError("课程知识点不存在");
    } else if (query.courseConceptId) {
      courseGraphConceptIds = [query.courseConceptId];
    }
  } else if (query.courseConceptId) {
    throw new ResourceNotFoundError("请选择课程后再筛选课程知识点");
  }
  const where: Prisma.QuestionWhereInput = {
    deletedAt: null,
    status:
      query.scope === "OWNED"
        ? { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] }
        : QuestionStatus.ACTIVE,
    isAssignmentOnly: false,
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
    ...(query.courseId
      ? {
          AND: [
            {
              OR: [
                ...(!query.courseConceptId
                  ? [{ categoryCourseId: { in: courseIds } }]
                  : []),
                {
                  graphBindings: {
                    some: {
                      courseId: { in: courseIds },
                      ...(query.courseConceptId
                        ? { conceptId: { in: courseGraphConceptIds } }
                        : {}),
                    },
                  },
                },
              ],
            },
          ],
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

  const courseBindings = query.courseId
    ? await prisma.questionKnowledgeGraphBinding.findMany({
        where: {
          courseId: { in: courseIds },
          ...(query.courseConceptId
            ? { conceptId: { in: courseGraphConceptIds } }
            : {}),
          questionId: { in: records.map((question) => question.id) },
        },
        select: {
          questionId: true,
          conceptId: true,
          sourceNode: { select: { code: true, name: true } },
        },
      })
    : [];
  const conceptsByQuestion = new Map<string, typeof courseBindings>();
  for (const binding of courseBindings) {
    const current = conceptsByQuestion.get(binding.questionId) ?? [];
    current.push(binding);
    conceptsByQuestion.set(binding.questionId, current);
  }

  return {
    items: records.map((question) => ({
      ...listItemFromRecord(teacherId, question),
      ...(query.courseId
        ? {
            courseGraphConcepts: [
              ...new Map(
                (conceptsByQuestion.get(question.id) ?? []).map(
                  ({ sourceNode }) => [
                    `${sourceNode.code}\u0000${sourceNode.name}`,
                    {
                      id: `CODE:${sourceNode.code}`,
                      code: sourceNode.code,
                      name: sourceNode.name,
                    },
                  ],
                ),
              ).values(),
            ],
          }
        : {}),
    })),
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
      (question.visibility !== QuestionVisibility.PUBLIC ||
        question.status !== QuestionStatus.ACTIVE))
  ) {
    throw new ResourceNotFoundError("题目不存在");
  }
  return detailFromRecord(teacherId, question);
}

export async function createQuestion(
  teacherId: string,
  input: QuestionUpsertData,
): Promise<QuestionDetail> {
  assertTeacherQuestionIsPrivate(input.visibility);
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

export async function createQuestionsInBulk(
  teacherId: string,
  questions: QuestionUpsertData[],
): Promise<string[]> {
  for (const question of questions)
    assertTeacherQuestionIsPrivate(question.visibility);
  return prisma.$transaction(async (transaction) => {
    const ids: string[] = [];
    for (const input of questions) {
      await assertKnowledgePointsExist(transaction, input.knowledgePointIds);
      const created = await transaction.question.create({
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
      ids.push(created.id);
    }
    return ids;
  });
}

export async function updateQuestion(
  teacherId: string,
  questionId: string,
  input: QuestionUpsertData,
): Promise<QuestionDetail> {
  assertTeacherQuestionIsPrivate(input.visibility);
  const ownedQuestion = await requireOwnedQuestion(teacherId, questionId);
  assertTeacherCanEditQuestion(ownedQuestion, teacherId);
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
        ...(ownedQuestion.status === QuestionStatus.DRAFT &&
        input.type === QuestionType.PYTHON_PROGRAMMING
          ? { status: QuestionStatus.DRAFT }
          : {}),
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
  const copiedId = await prisma.$transaction(async (transaction) => {
    const source = await transaction.question.findFirst({
      where: {
        id: sourceQuestionId,
        deletedAt: null,
        status: QuestionStatus.ACTIVE,
      },
      include: questionInclude,
    });
    if (!source || !canTeacherCopyQuestion(teacherId, source)) {
      throw new ResourceNotFoundError("题目不存在");
    }

    const programmingConfig =
      source.type === QuestionType.PYTHON_PROGRAMMING
        ? await transaction.programmingQuestionConfigRevision.findFirst({
            where: { questionId: source.id },
            orderBy: [{ revisionNumber: "desc" }, { id: "desc" }],
            include: {
              testCases: {
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              },
            },
          })
        : null;
    if (source.type === QuestionType.PYTHON_PROGRAMMING && !programmingConfig) {
      throw new QuestionOperationError("公共编程题缺少判题配置，暂时无法复制");
    }

    const copy = await transaction.question.create({
      data: {
        creatorId: teacherId,
        title: `${source.title}（副本）`,
        content: source.content,
        type: source.type,
        difficulty: source.difficulty,
        visibility: QuestionVisibility.PRIVATE,
        status: QuestionStatus.ACTIVE,
        isAssignmentOnly: false,
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
          create: source.knowledgePointLinks.map(
            ({ knowledgePoint, weight }) => ({
              knowledgePointId: knowledgePoint.id,
              weight,
            }),
          ),
        },
        ...(programmingConfig
          ? {
              programmingConfigRevisions: {
                create: {
                  revisionNumber: 1,
                  standardCode: programmingConfig.standardCode,
                  starterCode: programmingConfig.starterCode,
                  totalPoints: programmingConfig.totalPoints,
                  cpuTimeMs: programmingConfig.cpuTimeMs,
                  wallTimeMs: programmingConfig.wallTimeMs,
                  memoryBytes: programmingConfig.memoryBytes,
                  outputBytes: programmingConfig.outputBytes,
                  processCount: programmingConfig.processCount,
                  testCasesHash: programmingConfig.testCasesHash,
                  configurationHash: programmingConfig.configurationHash,
                  executorRuleVersion: programmingConfig.executorRuleVersion,
                  createdById: teacherId,
                  testCases: {
                    create: programmingConfig.testCases.map((testCase) => ({
                      visibility: testCase.visibility,
                      name: testCase.name,
                      stdin: testCase.stdin,
                      expectedOutput: testCase.expectedOutput,
                      points: testCase.points,
                      sortOrder: testCase.sortOrder,
                    })),
                  },
                },
              },
            }
          : {}),
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
  const ownedQuestion = await requireOwnedQuestion(teacherId, questionId);
  assertTeacherCanEditQuestion(ownedQuestion, teacherId);
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
