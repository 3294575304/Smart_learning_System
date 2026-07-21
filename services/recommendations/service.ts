import "server-only";

import {
  Prisma,
  QuestionStatus,
  RecommendationSource,
  RecommendationStatus,
} from "@prisma/client";

import {
  enhanceRecommendationReasons,
  type RecommendationExplanationProvider,
} from "@/services/ai/recommender";
import type { AuthenticatedUser } from "@/services/auth/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { recommendQuestions } from "@/services/recommendations/algorithm";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import { assertCanAccessRecommendation } from "@/services/recommendations/policy";
import {
  buildRecommendationRequest,
  createRecommendationCycleKey,
  expireStudentRecommendations,
  loadActiveRecommendationQuestionIds,
  loadEligibleRecommendationCandidates,
  loadRecommendationById,
  loadRecommendationPage,
  loadRecommendationsByCycle,
  loadRecommendationStudentContext,
  persistRecommendations,
  recommendationCursorBelongsToStudent,
  startPendingRecommendation,
  type RecommendationViewRecord,
} from "@/services/recommendations/repository";
import {
  recommendationGenerationApiSchema,
  recommendationIdSchema,
  recommendationListQuerySchema,
  recommendationRequestSchema,
  type RecommendationRequest,
} from "@/services/recommendations/schemas";
import type {
  PersonalizedRecommendationResult,
  RecommendationDetailView,
  RecommendationGenerationResult,
  RecommendationListItemView,
  RecommendationListResult,
} from "@/services/recommendations/types";

export interface RecommendationServiceOptions {
  now?: Date;
  explanationProvider?: RecommendationExplanationProvider;
  aiTimeoutMs?: number;
}

export async function createPersonalizedRecommendations(
  actor: AuthenticatedUser,
  rawRequest: unknown,
  options: RecommendationServiceOptions = {},
): Promise<PersonalizedRecommendationResult> {
  const request: RecommendationRequest =
    recommendationRequestSchema.parse(rawRequest);
  const now = options.now ?? new Date();
  const context = await loadRecommendationStudentContext(actor, request);
  const cycleKey = createRecommendationCycleKey(request, context.version, now);
  const activeRecommendationQuestionIds =
    await loadActiveRecommendationQuestionIds(request.studentId, cycleKey, now);
  const excludedQuestionIds = [
    ...new Set([
      ...context.recentCompletedQuestionIds,
      ...activeRecommendationQuestionIds,
    ]),
  ];
  const candidates = await loadEligibleRecommendationCandidates(
    request,
    context.teacherId,
    excludedQuestionIds,
  );

  const algorithmResult = recommendQuestions({
    studentId: request.studentId,
    weakKnowledgePoints: context.weakKnowledgePoints,
    knowledgeMasteries: context.knowledgeMasteries,
    recentCompletedQuestionIds: context.recentCompletedQuestionIds,
    activeRecommendationQuestionIds,
    recentErrorTypes: context.recentErrorTypes,
    recommendedDifficulty: request.recommendedDifficulty,
    consecutiveCorrect: context.consecutiveCorrect,
    consecutiveWrong: context.consecutiveWrong,
    teacherScope: {
      teacherId: context.teacherId,
      candidateQuestionIds: request.teacherScope.candidateQuestionIds,
      knowledgePointIds: request.teacherScope.knowledgePointIds,
      types: request.teacherScope.types,
      tags: request.teacherScope.tags,
    },
    candidates,
    limit: request.count,
  });

  const enhanced = options.explanationProvider
    ? await enhanceRecommendationReasons(
        options.explanationProvider,
        algorithmResult.items,
        options.aiTimeoutMs,
      )
    : {
        items: algorithmResult.items,
        enhanced: false,
        retryCount: 0,
        errorCode: null,
      };
  const source = enhanced.enhanced
    ? RecommendationSource.HYBRID
    : RecommendationSource.RULE;

  const persistedQuestionIds = await persistRecommendations({
    studentId: request.studentId,
    cycleKey,
    targetDifficulty: request.recommendedDifficulty,
    source,
    analysisId: context.analysisId,
    items: enhanced.items,
    now,
  });
  const persistedQuestionIdSet = new Set(persistedQuestionIds);
  const persistedItems = enhanced.items.filter((item) =>
    persistedQuestionIdSet.has(item.questionId),
  );
  const relaxedConstraints = [...algorithmResult.metadata.relaxedConstraints];
  if (persistedItems.length < enhanced.items.length) {
    relaxedConstraints.push("并发请求已推荐部分题目，本次结果已自动去重");
  }

  return {
    cycleKey,
    studentId: request.studentId,
    targetDifficulty: request.recommendedDifficulty,
    source,
    generatedAt: now,
    items: persistedItems,
    metadata: {
      ...algorithmResult.metadata,
      returnedCount: persistedItems.length,
      representedTypes: [...new Set(persistedItems.map((item) => item.type))],
      relaxedConstraints,
    },
  };
}

function listItemFromRecord(
  record: RecommendationViewRecord,
): RecommendationListItemView {
  return {
    id: record.id,
    questionId: record.question.id,
    title: record.question.title,
    content: record.question.content,
    type: record.question.type,
    difficulty: record.question.difficulty,
    knowledgePoints: record.question.knowledgePointLinks.map(
      (link) => link.knowledgePoint,
    ),
    reason: record.reason,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
  };
}

function detailFromRecord(
  record: RecommendationViewRecord,
): RecommendationDetailView {
  return {
    ...listItemFromRecord(record),
    options: record.question.options,
    startedAt: record.startedAt?.toISOString() ?? null,
  };
}

/** Builds the server-owned practice scope before invoking the core service. */
export async function createOrGetPersonalizedRecommendations(
  actor: AuthenticatedUser,
  rawInput: unknown,
  options: RecommendationServiceOptions = {},
): Promise<RecommendationGenerationResult> {
  const input = recommendationGenerationApiSchema.parse(rawInput);
  const request = await buildRecommendationRequest(actor, input);
  let result: PersonalizedRecommendationResult;
  try {
    result = await createPersonalizedRecommendations(actor, request, options);
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new RecommendationOperationError(
        "推荐生成发生并发冲突，请稍后重试",
        409,
      );
    }
    throw error;
  }
  if (result.items.length === 0) {
    throw new RecommendationOperationError("当前无法生成有效推荐", 422);
  }

  const records = await loadRecommendationsByCycle(
    result.studentId,
    result.cycleKey,
  );
  if (records.length === 0) {
    throw new RecommendationOperationError("当前无法生成有效推荐", 422);
  }
  const items = records.map(listItemFromRecord);
  return {
    cycleKey: result.cycleKey,
    studentId: result.studentId,
    targetDifficulty: result.targetDifficulty,
    source: result.source,
    generatedAt: result.generatedAt.toISOString(),
    items,
    metadata: {
      ...result.metadata,
      returnedCount: items.length,
      representedTypes: [...new Set(items.map((item) => item.type))],
    },
  };
}

export async function listRecommendations(
  actor: AuthenticatedUser,
  rawQuery: unknown,
  now = new Date(),
): Promise<RecommendationListResult> {
  assertCanAccessRecommendation(actor, actor.id);
  const query = recommendationListQuerySchema.parse(rawQuery);
  await expireStudentRecommendations(actor.id, now);
  if (
    query.cursor &&
    !(await recommendationCursorBelongsToStudent(actor.id, query.cursor))
  ) {
    throw new RecommendationOperationError("分页游标无效", 400);
  }
  const records = await loadRecommendationPage(actor.id, query);
  const pageRecords = records.slice(0, query.limit);
  return {
    items: pageRecords.map(listItemFromRecord),
    pagination: {
      limit: query.limit,
      nextCursor:
        records.length > query.limit ? (pageRecords.at(-1)?.id ?? null) : null,
    },
  };
}

export async function getRecommendationDetail(
  actor: AuthenticatedUser,
  rawRecommendationId: unknown,
  now = new Date(),
): Promise<RecommendationDetailView> {
  const recommendationId = recommendationIdSchema.parse(rawRecommendationId);
  const record = await loadRecommendationById(recommendationId);
  if (!record) throw new ResourceNotFoundError("推荐记录不存在");
  assertCanAccessRecommendation(actor, record.studentId);
  await expireStudentRecommendations(record.studentId, now);
  const current = await loadRecommendationById(recommendationId);
  if (!current) throw new ResourceNotFoundError("推荐记录不存在");
  return detailFromRecord(current);
}

export async function startRecommendation(
  actor: AuthenticatedUser,
  rawRecommendationId: unknown,
  now = new Date(),
): Promise<RecommendationDetailView> {
  const recommendationId = recommendationIdSchema.parse(rawRecommendationId);
  const initial = await loadRecommendationById(recommendationId);
  if (!initial) throw new ResourceNotFoundError("推荐记录不存在");
  assertCanAccessRecommendation(actor, initial.studentId);
  await expireStudentRecommendations(initial.studentId, now);

  const current = await loadRecommendationById(recommendationId);
  if (!current) throw new ResourceNotFoundError("推荐记录不存在");
  if (current.status === RecommendationStatus.STARTED) {
    return detailFromRecord(current);
  }
  if (current.status !== RecommendationStatus.PENDING) {
    throw new RecommendationOperationError("当前推荐状态不能开始练习", 409);
  }
  if (
    current.question.status !== QuestionStatus.ACTIVE ||
    current.question.deletedAt !== null
  ) {
    throw new RecommendationOperationError("推荐题目当前不可用", 409);
  }

  const started = await startPendingRecommendation({
    recommendationId,
    studentId: actor.id,
    now,
  });
  const latest = await loadRecommendationById(recommendationId);
  if (!latest) throw new ResourceNotFoundError("推荐记录不存在");
  if (started || latest.status === RecommendationStatus.STARTED) {
    return detailFromRecord(latest);
  }
  throw new RecommendationOperationError("推荐状态已发生变化", 409);
}
