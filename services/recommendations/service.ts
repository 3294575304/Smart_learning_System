import "server-only";

import { RecommendationSource } from "@prisma/client";

import {
  enhanceRecommendationReasons,
  type RecommendationExplanationProvider,
} from "@/services/ai/recommender";
import type { AuthenticatedUser } from "@/services/auth/types";
import { recommendQuestions } from "@/services/recommendations/algorithm";
import {
  createRecommendationCycleKey,
  loadActiveRecommendationQuestionIds,
  loadEligibleRecommendationCandidates,
  loadRecommendationStudentContext,
  persistRecommendations,
} from "@/services/recommendations/repository";
import {
  recommendationRequestSchema,
  type RecommendationRequest,
} from "@/services/recommendations/schemas";
import type { PersonalizedRecommendationResult } from "@/services/recommendations/types";

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
