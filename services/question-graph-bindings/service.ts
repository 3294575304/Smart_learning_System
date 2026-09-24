import {
  AuditAction,
  AuditTargetType,
  KnowledgeGraphRelationType,
  Prisma,
  QuestionGraphBindingType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { QuestionGraphBindingError } from "@/services/question-graph-bindings/errors";
import type {
  GraphConceptQuestionsQuery,
  SaveGraphBindingsData,
} from "@/services/question-graph-bindings/schemas";

async function ownedQuestion(
  teacherId: string,
  questionId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const question = await client.question.findFirst({
    where: { id: questionId, creatorId: teacherId, deletedAt: null },
    select: { id: true },
  });
  if (!question) throw new ResourceNotFoundError("题目不存在");
  return question;
}

async function ownedCourse(
  teacherId: string,
  courseId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const course = await client.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      currentPublishedKnowledgeGraphVersionId: true,
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  return course;
}

export async function listTeacherBindingCourses(teacherId: string) {
  return prisma.course.findMany({
    where: { teacherId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      courseNo: true,
      term: true,
      currentPublishedKnowledgeGraphVersionId: true,
    },
  });
}

export async function getGraphQuestionCoverage(
  teacherId: string,
  courseId: string,
) {
  const course = await ownedCourse(teacherId, courseId);
  if (!course.currentPublishedKnowledgeGraphVersionId)
    return { graphVersionId: null, versionNumber: null, points: [] };

  const version = await prisma.publishedKnowledgeGraphVersion.findFirst({
    where: { id: course.currentPublishedKnowledgeGraphVersionId, courseId },
    select: {
      id: true,
      versionNumber: true,
      nodes: {
        where: { nodeType: "KNOWLEDGE_POINT", concept: { courseId } },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        select: {
          id: true,
          conceptId: true,
          code: true,
          name: true,
          concept: { select: { stableKey: true } },
        },
      },
    },
  });
  if (!version)
    throw new QuestionGraphBindingError("当前正式知识图谱不可用", 409);

  // 旧版本绑定通过课程内稳定 Concept 解析，只统计本教师仍可管理的题目。
  const counts = await prisma.questionKnowledgeGraphBinding.groupBy({
    by: ["conceptId"],
    where: {
      courseId,
      conceptId: { in: version.nodes.map((node) => node.conceptId) },
      question: { creatorId: teacherId, deletedAt: null },
    },
    _count: { _all: true },
  });
  const countByConcept = new Map(
    counts.map((item) => [item.conceptId, item._count._all]),
  );
  return {
    graphVersionId: version.id,
    versionNumber: version.versionNumber,
    points: version.nodes.map((node) => ({
      conceptId: node.conceptId,
      conceptKey: node.concept.stableKey,
      publishedNodeId: node.id,
      name: node.name,
      code: node.code,
      questionCount: countByConcept.get(node.conceptId) ?? 0,
    })),
  };
}

export async function listGraphConceptQuestions(
  teacherId: string,
  courseId: string,
  conceptId: string,
  query: GraphConceptQuestionsQuery,
) {
  const course = await ownedCourse(teacherId, courseId);
  if (course.currentPublishedKnowledgeGraphVersionId !== query.graphVersionId)
    throw new QuestionGraphBindingError(
      "正式图谱已更新，请刷新题目关联后重试",
      409,
    );
  const node = await prisma.publishedKnowledgeGraphNode.findFirst({
    where: {
      graphVersionId: query.graphVersionId,
      conceptId,
      concept: { courseId },
      nodeType: "KNOWLEDGE_POINT",
    },
    select: { id: true },
  });
  if (!node) throw new ResourceNotFoundError("知识点不存在");

  const bindingScope = { courseId, conceptId };
  const where: Prisma.QuestionWhereInput = {
    creatorId: teacherId,
    deletedAt: null,
    graphBindings:
      query.mode === "BOUND" ? { some: bindingScope } : { none: bindingScope },
    ...(query.keyword
      ? {
          OR: [
            { title: { contains: query.keyword, mode: "insensitive" } },
            { content: { contains: query.keyword, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, questions] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        difficulty: true,
        status: true,
        graphBindings: {
          where: bindingScope,
          select: {
            bindingType: true,
            sourceGraphVersion: { select: { versionNumber: true } },
          },
        },
      },
    }),
  ]);
  return {
    items: questions.map(({ graphBindings, ...question }) => ({
      ...question,
      bindingType: graphBindings[0]?.bindingType ?? null,
      sourceVersionNumber:
        graphBindings[0]?.sourceGraphVersion.versionNumber ?? null,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function listBindableNodes(
  teacherId: string,
  courseId: string,
  keyword: string | undefined,
  limit: number,
) {
  const course = await ownedCourse(teacherId, courseId);
  if (!course.currentPublishedKnowledgeGraphVersionId)
    throw new QuestionGraphBindingError("该课程尚未发布正式知识图谱", 409);
  const version = await prisma.publishedKnowledgeGraphVersion.findFirst({
    where: { id: course.currentPublishedKnowledgeGraphVersionId, courseId },
    select: {
      id: true,
      versionNumber: true,
      nodes: {
        where: keyword
          ? {
              OR: [
                { name: { contains: keyword, mode: "insensitive" } },
                { code: { contains: keyword, mode: "insensitive" } },
              ],
            }
          : undefined,
        take: limit,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          conceptId: true,
          name: true,
          code: true,
          nodeType: true,
          importance: true,
          isKeyTopic: true,
          isDifficultTopic: true,
          sourceRefs: true,
          sourcePath: true,
          incomingEdges: {
            where: { relationType: KnowledgeGraphRelationType.CONTAINS },
            take: 1,
            select: { fromNode: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!version)
    throw new QuestionGraphBindingError("当前正式知识图谱不可用", 409);
  return {
    graphVersionId: version.id,
    versionNumber: version.versionNumber,
    nodes: version.nodes.map(({ incomingEdges, ...node }) => ({
      ...node,
      parent: incomingEdges[0]?.fromNode ?? null,
    })),
  };
}

export async function getQuestionGraphBindings(
  teacherId: string,
  questionId: string,
  courseId: string,
) {
  await Promise.all([
    ownedQuestion(teacherId, questionId),
    ownedCourse(teacherId, courseId),
  ]);
  const course = await ownedCourse(teacherId, courseId);
  const set = await prisma.questionKnowledgeGraphBindingSet.findUnique({
    where: { questionId_courseId: { questionId, courseId } },
    include: {
      bindings: {
        orderBy: [{ bindingType: "asc" }, { createdAt: "asc" }],
        include: {
          concept: true,
          sourceGraphVersion: { select: { versionNumber: true } },
          sourceNode: {
            select: {
              name: true,
              code: true,
              nodeType: true,
              sourceRefs: true,
              sourcePath: true,
            },
          },
        },
      },
    },
  });
  const currentVersionId = course.currentPublishedKnowledgeGraphVersionId;
  const currentNodes =
    currentVersionId && set
      ? await prisma.publishedKnowledgeGraphNode.findMany({
          where: {
            graphVersionId: currentVersionId,
            conceptId: { in: set.bindings.map((item) => item.conceptId) },
          },
          select: { id: true, conceptId: true, name: true, code: true },
        })
      : [];
  const currentByConcept = new Map(
    currentNodes.map((node) => [node.conceptId, node]),
  );
  return {
    revision: set?.revision ?? 0,
    sourceVersionId: set?.bindings[0]?.sourceGraphVersionId ?? null,
    sourceVersionNumber:
      set?.bindings[0]?.sourceGraphVersion.versionNumber ?? null,
    currentVersionId,
    sourceVersionStatus:
      !set?.bindings.length ||
      set.bindings[0]?.sourceGraphVersionId === currentVersionId
        ? "CURRENT"
        : "SOURCE_VERSION_NOT_CURRENT",
    needsReview: Boolean(
      set?.bindings.some((binding) => !currentByConcept.has(binding.conceptId)),
    ),
    bindings: (set?.bindings ?? []).map((binding) => {
      const current = currentByConcept.get(binding.conceptId);
      const status =
        binding.sourceGraphVersionId === currentVersionId
          ? "CURRENT"
          : current
            ? "RESOLVED_TO_CURRENT_VERSION"
            : "MISSING_FROM_CURRENT_VERSION";
      return {
        id: binding.id,
        conceptId: binding.conceptId,
        type: binding.bindingType,
        sourceGraphVersionId: binding.sourceGraphVersionId,
        sourceGraphVersionNumber: binding.sourceGraphVersion.versionNumber,
        sourceNodeId: binding.sourceNodeId,
        sourceNode: binding.sourceNode,
        currentNode: current ?? null,
        status,
      };
    }),
  };
}

export async function saveQuestionGraphBindings(
  teacherId: string,
  questionId: string,
  input: SaveGraphBindingsData,
  context: AuditRequestContext,
) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await ownedQuestion(teacherId, questionId, tx);
        const course = await ownedCourse(teacherId, input.courseId, tx);
        if (!course.currentPublishedKnowledgeGraphVersionId)
          throw new QuestionGraphBindingError(
            "该课程尚未发布正式知识图谱",
            409,
          );
        if (
          course.currentPublishedKnowledgeGraphVersionId !==
          input.graphVersionId
        )
          throw new QuestionGraphBindingError(
            "知识图谱版本已更新，请刷新后重新审核",
            409,
          );
        const nodes = await tx.publishedKnowledgeGraphNode.findMany({
          where: {
            graphVersionId: input.graphVersionId,
            id: { in: input.bindings.map((item) => item.publishedNodeId) },
          },
          select: { id: true, conceptId: true },
        });
        const nodeById = new Map(nodes.map((node) => [node.id, node]));
        if (
          nodes.length !== input.bindings.length ||
          input.bindings.some(
            (item) =>
              nodeById.get(item.publishedNodeId)?.conceptId !== item.conceptId,
          )
        )
          throw new QuestionGraphBindingError(
            "提交的正式节点与 Concept 不匹配",
          );
        const existing = await tx.questionKnowledgeGraphBindingSet.findUnique({
          where: {
            questionId_courseId: { questionId, courseId: input.courseId },
          },
          include: { bindings: true },
        });
        const normalized = input.bindings
          .map(
            (item) => `${item.type}:${item.conceptId}:${item.publishedNodeId}`,
          )
          .sort();
        const previous = (existing?.bindings ?? [])
          .map(
            (item) =>
              `${item.bindingType}:${item.conceptId}:${item.sourceNodeId}`,
          )
          .sort();
        if (normalized.join("|") === previous.join("|") && existing) return;
        if ((existing?.revision ?? 0) !== input.expectedRevision)
          throw new QuestionGraphBindingError(
            "绑定已被其他页面修改，请刷新后重试",
            409,
          );
        const set = existing
          ? await tx.questionKnowledgeGraphBindingSet.update({
              where: { id: existing.id },
              data: { revision: { increment: 1 } },
            })
          : await tx.questionKnowledgeGraphBindingSet.create({
              data: { questionId, courseId: input.courseId },
            });
        await tx.questionKnowledgeGraphBinding.deleteMany({
          where: { bindingSetId: set.id },
        });
        if (input.bindings.length)
          await tx.questionKnowledgeGraphBinding.createMany({
            data: input.bindings.map((item) => ({
              bindingSetId: set.id,
              questionId,
              courseId: input.courseId,
              conceptId: item.conceptId,
              sourceGraphVersionId: input.graphVersionId,
              sourceNodeId: item.publishedNodeId,
              bindingType: item.type,
              createdById: teacherId,
            })),
          });
        const primary = input.bindings.find(
          (item) => item.type === QuestionGraphBindingType.PRIMARY,
        );
        await writeGovernanceAuditLog(tx, {
          actorId: teacherId,
          action: AuditAction.QUESTION_GRAPH_BINDINGS_UPDATED,
          targetType: AuditTargetType.QUESTION,
          targetId: questionId,
          summary: "更新题目课程知识图谱绑定",
          beforeData: null,
          afterData: {
            courseId: input.courseId,
            graphVersionId: input.graphVersionId,
            primaryConceptId: primary?.conceptId ?? null,
            secondaryCount: input.bindings.filter(
              (item) => item.type === QuestionGraphBindingType.SECONDARY,
            ).length,
          },
          context,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      throw new QuestionGraphBindingError(
        "绑定已被其他页面修改，请刷新后重试",
        409,
      );
    }
    throw error;
  }
  return getQuestionGraphBindings(teacherId, questionId, input.courseId);
}

export async function clearQuestionGraphBindings(
  teacherId: string,
  questionId: string,
  courseId: string,
  expectedRevision: number,
  context: AuditRequestContext,
) {
  await prisma.$transaction(async (tx) => {
    await ownedQuestion(teacherId, questionId, tx);
    await ownedCourse(teacherId, courseId, tx);
    const set = await tx.questionKnowledgeGraphBindingSet.findUnique({
      where: { questionId_courseId: { questionId, courseId } },
    });
    if (!set) return;
    if (set.revision !== expectedRevision)
      throw new QuestionGraphBindingError(
        "绑定已被其他页面修改，请刷新后重试",
        409,
      );
    await tx.questionKnowledgeGraphBindingSet.delete({ where: { id: set.id } });
    await writeGovernanceAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.QUESTION_GRAPH_BINDINGS_CLEARED,
      targetType: AuditTargetType.QUESTION,
      targetId: questionId,
      summary: "清除题目课程知识图谱绑定",
      beforeData: { courseId, revision: expectedRevision },
      afterData: null,
      context,
    });
  });
  return { cleared: true, revision: 0 };
}
