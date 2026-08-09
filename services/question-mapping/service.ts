import "server-only";

import {
  AIQuestionMappingBatchStatus,
  AuditAction,
  AuditTargetType,
  Prisma,
  QuestionGraphBindingType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createAIProvider } from "@/services/ai/provider-factory";
import {
  AIProviderRequestError,
  type AIProvider,
} from "@/services/ai/provider";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { learnerProfileFingerprint } from "@/services/learner-profiles/fingerprint";
import { QuestionGraphBindingError } from "@/services/question-graph-bindings/errors";
import { localQuestionConceptCandidates } from "@/services/question-mapping/candidates";
import {
  QUESTION_MAPPING_MODEL,
  QUESTION_MAPPING_PROMPT_VERSION,
  QUESTION_MAPPING_RULE_VERSION,
  createQuestionMappingBatchSchema,
  questionMappingAIOutputSchema,
  type QuestionMappingAIInput,
  type ConfirmQuestionMappingBatchData,
} from "@/services/question-mapping/schemas";

interface GeneratedCandidate {
  conceptId: string;
  publishedNodeId: string;
  confidence: number;
  reason: string;
}

function questionMappingTimeoutMs() {
  const value = Number(process.env.AI_TIMEOUT_MS);
  return Number.isInteger(value) && value >= 1_000
    ? Math.min(value, 60_000)
    : 15_000;
}

function safeGenerationFailure(error: unknown) {
  if (error instanceof AIProviderRequestError) {
    return {
      code: error.code,
      summary: "外部 AI 候选生成失败，已使用本地降级候选",
    };
  }
  return {
    code: "AI_MAPPING_OUTPUT_INVALID",
    summary: "外部 AI 返回无效候选，已使用本地降级候选",
  };
}

async function generateCandidates(
  provider: AIProvider | null,
  input: QuestionMappingAIInput,
  nodes: Array<{
    id: string;
    conceptId: string;
    code: string;
    name: string;
    description: string | null;
  }>,
) {
  const local = new Map<string, GeneratedCandidate[]>(
    input.questions.map((question) => [
      question.id,
      localQuestionConceptCandidates(
        { title: question.title, content: question.content, tags: [] },
        nodes,
      ),
    ]),
  );
  if (!provider?.mapQuestionsToConcepts) {
    return {
      candidates: local,
      provider: "local-fallback",
      model: QUESTION_MAPPING_MODEL,
      failure: {
        code: "AI_MAPPING_PROVIDER_UNAVAILABLE",
        summary: "外部 AI 未配置，已使用本地降级候选",
      },
    };
  }

  let validationError: string | undefined;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await provider.mapQuestionsToConcepts(input, {
        signal: AbortSignal.timeout(questionMappingTimeoutMs()),
        validationError,
      });
      const parsed = questionMappingAIOutputSchema.safeParse(raw);
      if (!parsed.success) {
        validationError = parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        continue;
      }
      const questionIds = new Set(input.questions.map((item) => item.id));
      const nodeByConcept = new Map(
        nodes.map((node) => [node.conceptId, node]),
      );
      const invalidId = parsed.data.mappings.some(
        (mapping) =>
          !questionIds.has(mapping.questionId) ||
          mapping.candidates.some(
            (candidate) => !nodeByConcept.has(candidate.conceptId),
          ),
      );
      if (invalidId) {
        validationError = "输出包含输入范围之外的 questionId 或 conceptId";
        continue;
      }
      const candidates = new Map<string, GeneratedCandidate[]>();
      for (const question of input.questions) candidates.set(question.id, []);
      for (const mapping of parsed.data.mappings) {
        candidates.set(
          mapping.questionId,
          mapping.candidates.map((candidate) => ({
            conceptId: candidate.conceptId,
            publishedNodeId: nodeByConcept.get(candidate.conceptId)!.id,
            confidence: candidate.confidence,
            reason: candidate.reason,
          })),
        );
      }
      return {
        candidates,
        provider: provider.name,
        model: provider.model,
        failure: null,
      };
    }
    throw new Error("AI mapping output validation failed");
  } catch (error) {
    return {
      candidates: local,
      provider: "local-fallback",
      model: QUESTION_MAPPING_MODEL,
      failure: safeGenerationFailure(error),
    };
  }
}

async function ownedCourse(teacherId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      currentPublishedKnowledgeGraphVersionId: true,
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  if (!course.currentPublishedKnowledgeGraphVersionId) {
    throw new QuestionGraphBindingError("该课程尚未发布正式知识图谱", 409);
  }
  return course;
}

export async function createQuestionMappingBatch(
  teacherId: string,
  courseId: string,
  rawInput: unknown,
  context: AuditRequestContext,
) {
  const input = createQuestionMappingBatchSchema.parse(rawInput);
  const course = await ownedCourse(teacherId, courseId);
  const graphVersionId = course.currentPublishedKnowledgeGraphVersionId;
  if (!graphVersionId) {
    throw new QuestionGraphBindingError("该课程尚未发布正式知识图谱", 409);
  }
  const [questions, graphVersion] = await Promise.all([
    prisma.question.findMany({
      where: {
        id: { in: input.questionIds },
        creatorId: teacherId,
        deletedAt: null,
        graphBindingSets: { none: { courseId } },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        title: true,
        content: true,
        tags: true,
        type: true,
        difficulty: true,
        updatedAt: true,
      },
    }),
    prisma.publishedKnowledgeGraphVersion.findUniqueOrThrow({
      where: { id: graphVersionId },
      select: {
        id: true,
        versionNumber: true,
        nodes: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            conceptId: true,
            code: true,
            name: true,
            description: true,
          },
        },
      },
    }),
  ]);
  if (!questions.length) {
    throw new QuestionGraphBindingError(
      "所选题目不存在，或都已有人工确认绑定",
      409,
    );
  }
  if (!graphVersion.nodes.length) {
    throw new QuestionGraphBindingError("正式知识图谱没有可绑定节点", 409);
  }
  let provider: AIProvider | null = null;
  let configuredProvider = "unavailable";
  let configuredModel = "unavailable";
  try {
    provider = createAIProvider();
    configuredProvider = provider.name;
    configuredModel = provider.model;
  } catch {
    // Candidate generation remains available through the local fallback.
  }
  const inputFingerprint = learnerProfileFingerprint({
    idempotencyKey: input.idempotencyKey,
    promptVersion: QUESTION_MAPPING_PROMPT_VERSION,
    ruleVersion: QUESTION_MAPPING_RULE_VERSION,
    provider: configuredProvider,
    model: configuredModel,
    graphVersionId: graphVersion.id,
    questions: questions.map((question) => ({
      id: question.id,
      updatedAt: question.updatedAt.toISOString(),
      title: question.title,
      content: question.content,
      tags: question.tags,
    })),
  });
  const existing = await prisma.aIQuestionMappingBatch.findUnique({
    where: {
      createdById_courseId_inputFingerprint: {
        createdById: teacherId,
        courseId,
        inputFingerprint,
      },
    },
    select: { id: true },
  });
  if (existing) return getQuestionMappingBatch(teacherId, existing.id);

  const aiInput: QuestionMappingAIInput = {
    questions: questions.map((question) => ({
      id: question.id,
      title: question.title,
      content: question.content,
      type: question.type,
      difficulty: question.difficulty,
    })),
    concepts: graphVersion.nodes.map((node) => ({
      id: node.conceptId,
      code: node.code,
      name: node.name,
      description: node.description,
    })),
  };
  const generation = await generateCandidates(
    provider,
    aiInput,
    graphVersion.nodes,
  );

  const created = await prisma.$transaction(async (transaction) => {
    const batch = await transaction.aIQuestionMappingBatch.create({
      data: {
        courseId,
        graphVersionId: graphVersion.id,
        createdById: teacherId,
        status: AIQuestionMappingBatchStatus.READY,
        inputFingerprint,
        provider: generation.provider,
        model: generation.model,
        promptVersion: QUESTION_MAPPING_PROMPT_VERSION,
        ruleVersion: QUESTION_MAPPING_RULE_VERSION,
        failureCode: generation.failure?.code ?? null,
        failureSummary: generation.failure?.summary ?? null,
      },
    });
    for (const question of questions) {
      const candidates = generation.candidates.get(question.id) ?? [];
      await transaction.aIQuestionMappingCandidate.createMany({
        data: candidates.map((candidate, index) => ({
          batchId: batch.id,
          questionId: question.id,
          conceptId: candidate.conceptId,
          publishedNodeId: candidate.publishedNodeId,
          confidence: new Prisma.Decimal(candidate.confidence),
          reason: candidate.reason,
          rank: index + 1,
        })),
      });
    }
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.AI_QUESTION_MAPPING_BATCH_CREATED,
      targetType: AuditTargetType.COURSE,
      targetId: courseId,
      summary: "生成题目 Concept 候选批次",
      beforeData: null,
      afterData: {
        batchId: batch.id,
        graphVersionId: graphVersion.id,
        questionCount: questions.length,
        provider: generation.provider,
        model: generation.model,
        fallbackUsed: Boolean(generation.failure),
      },
      context,
    });
    return batch;
  });
  return getQuestionMappingBatch(teacherId, created.id);
}

export async function getQuestionMappingBatch(
  teacherId: string,
  batchId: string,
) {
  const batch = await prisma.aIQuestionMappingBatch.findFirst({
    where: { id: batchId, createdById: teacherId },
    include: {
      course: { select: { id: true, name: true } },
      graphVersion: { select: { versionNumber: true } },
      candidates: {
        orderBy: [{ questionId: "asc" }, { rank: "asc" }],
        include: {
          question: {
            select: { id: true, title: true, content: true, type: true },
          },
          publishedNode: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
  if (!batch) throw new ResourceNotFoundError("候选批次不存在");
  return {
    ...batch,
    candidates: batch.candidates.map((candidate) => ({
      ...candidate,
      confidence: candidate.confidence.toNumber(),
    })),
  };
}

export async function confirmQuestionMappingBatch(
  teacherId: string,
  batchId: string,
  input: ConfirmQuestionMappingBatchData,
  context: AuditRequestContext,
) {
  const result = await prisma.$transaction(async (transaction) => {
    const batch = await transaction.aIQuestionMappingBatch.findFirst({
      where: {
        id: batchId,
        createdById: teacherId,
        status: AIQuestionMappingBatchStatus.READY,
      },
      include: {
        course: { select: { currentPublishedKnowledgeGraphVersionId: true } },
        candidates: { select: { questionId: true } },
      },
    });
    if (!batch) throw new ResourceNotFoundError("待确认候选批次不存在");
    if (
      batch.course.currentPublishedKnowledgeGraphVersionId !==
      batch.graphVersionId
    ) {
      throw new QuestionGraphBindingError(
        "图谱版本已更新，请重新生成候选",
        409,
      );
    }
    const batchQuestionIds = new Set(
      batch.candidates.map((item) => item.questionId),
    );
    if (
      input.selections.some((item) => !batchQuestionIds.has(item.questionId))
    ) {
      throw new QuestionGraphBindingError("选择中包含批次外题目");
    }
    const grouped = new Map<string, typeof input.selections>();
    for (const selection of input.selections) {
      const values = grouped.get(selection.questionId) ?? [];
      values.push(selection);
      grouped.set(selection.questionId, values);
    }
    for (const values of grouped.values()) {
      if (
        values.filter((item) => item.type === QuestionGraphBindingType.PRIMARY)
          .length > 1
      ) {
        throw new QuestionGraphBindingError("每题最多选择一个主 Concept");
      }
      if (
        new Set(values.map((item) => item.conceptId)).size !== values.length
      ) {
        throw new QuestionGraphBindingError("同一题不能重复选择 Concept");
      }
    }
    const nodes = await transaction.publishedKnowledgeGraphNode.findMany({
      where: {
        graphVersionId: batch.graphVersionId,
        id: { in: input.selections.map((item) => item.publishedNodeId) },
      },
      select: { id: true, conceptId: true },
    });
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    if (
      input.selections.some(
        (item) =>
          nodeById.get(item.publishedNodeId)?.conceptId !== item.conceptId,
      )
    ) {
      throw new QuestionGraphBindingError("所选节点与 Concept 不匹配");
    }
    const existing =
      await transaction.questionKnowledgeGraphBindingSet.findMany({
        where: {
          courseId: batch.courseId,
          questionId: { in: [...grouped.keys()] },
        },
        select: { questionId: true },
      });
    const existingQuestionIds = new Set(
      existing.map((item) => item.questionId),
    );
    let confirmedQuestionCount = 0;
    for (const [questionId, selections] of grouped) {
      if (existingQuestionIds.has(questionId) || selections.length === 0)
        continue;
      await transaction.questionKnowledgeGraphBindingSet.create({
        data: {
          questionId,
          courseId: batch.courseId,
          bindings: {
            create: selections.map((selection) => ({
              questionId,
              courseId: batch.courseId,
              conceptId: selection.conceptId,
              sourceGraphVersionId: batch.graphVersionId,
              sourceNodeId: selection.publishedNodeId,
              bindingType: selection.type,
              createdById: teacherId,
            })),
          },
        },
      });
      confirmedQuestionCount += 1;
    }
    await transaction.aIQuestionMappingBatch.update({
      where: { id: batch.id },
      data: {
        status: AIQuestionMappingBatchStatus.CONFIRMED,
        confirmedSelections: input.selections as Prisma.InputJsonValue,
        confirmedAt: new Date(),
      },
    });
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.AI_QUESTION_MAPPING_BATCH_CONFIRMED,
      targetType: AuditTargetType.COURSE,
      targetId: batch.courseId,
      summary: "确认题目 Concept 候选批次",
      beforeData: { batchId, status: batch.status },
      afterData: {
        confirmedQuestionCount,
        skippedExistingQuestionCount: existingQuestionIds.size,
      },
      context,
    });
    return {
      confirmedQuestionCount,
      skippedExistingQuestionCount: existingQuestionIds.size,
    };
  });
  return result;
}

export async function listUnboundTeacherQuestions(
  teacherId: string,
  courseId: string,
) {
  const course = await ownedCourse(teacherId, courseId);
  const questions = await prisma.question.findMany({
    where: {
      creatorId: teacherId,
      deletedAt: null,
      graphBindingSets: { none: { courseId } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 100,
    select: { id: true, title: true, type: true, difficulty: true },
  });
  return { course, questions };
}
