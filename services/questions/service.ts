import "server-only";

import {
  AuditAction,
  AuditTargetType,
  Prisma,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { orderedCourseConceptOptions } from "@/services/questions/course-concept-options";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { QuestionOperationError } from "@/services/questions/errors";
import { teacherQuestionAccessWhere } from "@/services/questions/access";
import {
  listQuestionCourseCategories,
  requireActiveQuestionCourseCategory,
} from "@/services/question-course-categories/service";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
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
  questionCategory: { select: { name: true } },
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
  _teacherId: string,
  question: QuestionRecord,
): QuestionListItem {
  return {
    id: question.id,
    title: question.title,
    content: question.content,
    type: question.type,
    difficulty: question.difficulty,
    status: question.status,
    questionCategoryId: question.questionCategoryId,
    questionCategoryName: question.questionCategory?.name ?? null,
    revision: question.revision,
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
    canEdit: true,
    canDelete: true,
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
    questionCategoryId: input.questionCategoryId,
    title: input.title,
    content: input.content,
    type: input.type,
    difficulty: input.difficulty,
    visibility: QuestionVisibility.PUBLIC,
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
  teacherId: string,
  questionId: string,
): Promise<QuestionRecord | null> {
  return prisma.question.findFirst({
    where: {
      id: questionId,
      ...teacherQuestionAccessWhere(teacherId),
      deletedAt: null,
      status: { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] },
      isAssignmentOnly: false,
    },
    include: questionInclude,
  });
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

export async function listTeacherQuestionCategoryOptions() {
  return (await listQuestionCourseCategories(true)).map(({ id, name }) => ({
    id,
    name,
  }));
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
      questionCategoryId: true,
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
      questionCategoryId: string;
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
      course.questionCategoryId,
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
        questionCategoryId: course.questionCategoryId,
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
  let courseQuestionCategoryId: string | undefined;
  if (query.courseId) {
    const selectedCourse = await prisma.course.findFirst({
      where: {
        id: query.courseId,
        teacherId,
        status: { not: "ARCHIVED" },
      },
      select: {
        templateId: true,
        questionCategoryId: true,
        courseNo: true,
        name: true,
        term: true,
      },
    });
    if (!selectedCourse)
      throw new ResourceNotFoundError("课程不存在或无权访问");
    courseQuestionCategoryId = selectedCourse.questionCategoryId;
    if (query.categoryId && query.categoryId !== courseQuestionCategoryId) {
      throw new ResourceNotFoundError("所选课程与课程分类不匹配");
    }
    const courseGroup = await prisma.course.findMany({
      where: {
        teacherId,
        templateId: selectedCourse.templateId,
        questionCategoryId: selectedCourse.questionCategoryId,
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
    ...teacherQuestionAccessWhere(teacherId),
    deletedAt: null,
    status: { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] },
    isAssignmentOnly: false,
    ...((courseQuestionCategoryId ?? query.categoryId)
      ? { questionCategoryId: courseQuestionCategoryId ?? query.categoryId }
      : {}),
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
    ...(query.courseId && query.courseConceptId
      ? {
          graphBindings: {
            some: {
              courseId: { in: courseIds },
              conceptId: { in: courseGraphConceptIds },
            },
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
  const question = await findQuestionRecord(teacherId, questionId);
  if (!question) throw new ResourceNotFoundError("题目不存在");
  return detailFromRecord(teacherId, question);
}

export async function createQuestion(
  teacherId: string,
  input: QuestionUpsertData,
): Promise<QuestionDetail> {
  const questionId = await prisma.$transaction(async (transaction) => {
    return createQuestionInTransaction(transaction, teacherId, input);
  });
  return getTeacherQuestion(teacherId, questionId);
}

export async function createQuestionInTransaction(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  input: QuestionUpsertData,
  status?: QuestionStatus,
): Promise<string> {
  await requireActiveQuestionCourseCategory(
    input.questionCategoryId,
    transaction,
  );
  await assertKnowledgePointsExist(transaction, input.knowledgePointIds);
  const question = await transaction.question.create({
    data: {
      creatorId: teacherId,
      ...persistenceFields(input),
      ...(status ? { status } : {}),
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
}

export async function createQuestionsInBulk(
  teacherId: string,
  questions: QuestionUpsertData[],
): Promise<string[]> {
  return prisma.$transaction(async (transaction) => {
    const ids: string[] = [];
    for (const input of questions) {
      await requireActiveQuestionCourseCategory(
        input.questionCategoryId,
        transaction,
      );
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
  context: AuditRequestContext,
): Promise<QuestionDetail> {
  if (!input.revision) {
    throw new QuestionOperationError("缺少题目修订号，请刷新后重试", 409);
  }
  await prisma.$transaction(async (transaction) => {
    const before = await transaction.question.findFirst({
      where: {
        id: questionId,
        ...teacherQuestionAccessWhere(teacherId),
        deletedAt: null,
        status: { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] },
        isAssignmentOnly: false,
      },
      select: {
        id: true,
        title: true,
        status: true,
        questionCategoryId: true,
        revision: true,
      },
    });
    if (!before) throw new ResourceNotFoundError("题目不存在");
    if (before.revision !== input.revision) {
      throw new QuestionOperationError(
        "题目已被其他教师修改，请刷新后重试",
        409,
      );
    }
    await requireActiveQuestionCourseCategory(
      input.questionCategoryId,
      transaction,
    );
    await assertKnowledgePointsExist(transaction, input.knowledgePointIds);
    const updated = await transaction.question.updateMany({
      where: {
        id: questionId,
        revision: input.revision,
        deletedAt: null,
        status: { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] },
      },
      data: {
        ...persistenceFields(input),
        status: before.status,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new QuestionOperationError(
        "题目已被其他教师修改，请刷新后重试",
        409,
      );
    }
    await transaction.questionOption.deleteMany({ where: { questionId } });
    await transaction.questionKnowledgePoint.deleteMany({
      where: { questionId },
    });
    await transaction.questionOption.createMany({
      data: optionCreateData(input).map((option) => ({
        ...option,
        questionId,
      })),
    });
    await transaction.questionKnowledgePoint.createMany({
      data: input.knowledgePointIds.map((knowledgePointId) => ({
        questionId,
        knowledgePointId,
        weight: 1,
      })),
    });
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.QUESTION_UPDATED,
      targetType: AuditTargetType.QUESTION,
      targetId: questionId,
      summary: `编辑共享题目：${input.title}`,
      beforeData: {
        title: before.title,
        status: before.status,
        questionCategoryId: before.questionCategoryId,
        revision: before.revision,
      },
      afterData: {
        title: input.title,
        status: before.status,
        questionCategoryId: input.questionCategoryId,
        revision: input.revision + 1,
      },
      context,
    });
  });
  return getTeacherQuestion(teacherId, questionId);
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

export async function deleteQuestion(
  teacherId: string,
  questionId: string,
  context: AuditRequestContext,
): Promise<DeleteQuestionResult> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.question.findFirst({
      where: {
        id: questionId,
        ...teacherQuestionAccessWhere(teacherId),
        deletedAt: null,
        status: { not: QuestionStatus.ARCHIVED },
        isAssignmentOnly: false,
      },
      select: {
        title: true,
        status: true,
        questionCategoryId: true,
        revision: true,
      },
    });
    if (!before) throw new ResourceNotFoundError("题目不存在");
    const archived = await transaction.question.updateMany({
      where: { id: questionId, revision: before.revision, deletedAt: null },
      data: {
        status: QuestionStatus.ARCHIVED,
        archivedFromStatus: before.status,
        revision: { increment: 1 },
      },
    });
    if (archived.count !== 1) {
      throw new QuestionOperationError("题目状态已变化，请刷新后重试", 409);
    }
    const references = await referenceCounts(transaction, questionId);
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.QUESTION_ARCHIVED,
      targetType: AuditTargetType.QUESTION,
      targetId: questionId,
      summary: `归档共享题目：${before.title}`,
      beforeData: {
        title: before.title,
        status: before.status,
        questionCategoryId: before.questionCategoryId,
        revision: before.revision,
      },
      afterData: {
        title: before.title,
        status: QuestionStatus.ARCHIVED,
        references: Object.values(references).reduce(
          (sum, count) => sum + count,
          0,
        ),
        revision: before.revision + 1,
      },
      context,
    });
    return { questionId, mode: "ARCHIVED", references };
  });
}
