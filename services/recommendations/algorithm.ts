import { QuestionStatus, QuestionVisibility } from "@prisma/client";

import type {
  MatchedKnowledgePoint,
  RecommendationAlgorithmInput,
  RecommendationAlgorithmResult,
  RecommendationCandidate,
  RecommendationExclusionReason,
  RecommendationItem,
  RecommendationReasonCode,
  RecentErrorType,
} from "@/services/recommendations/types";

interface ScoredCandidate {
  candidate: RecommendationCandidate;
  matchedKnowledgePoints: MatchedKnowledgePoint[];
  baseScore: number;
}

const ERROR_TYPE_LABELS: Record<RecentErrorType, string> = {
  CONCEPT: "概念理解",
  CALCULATION: "计算",
  CARELESS: "审题或粗心",
  METHOD: "解题方法",
  UNKNOWN: "未分类",
};

function emptyExcludedCounts(): Record<RecommendationExclusionReason, number> {
  return {
    DUPLICATE_CANDIDATE: 0,
    UNAVAILABLE: 0,
    UNAUTHORIZED: 0,
    OUTSIDE_TEACHER_SCOPE: 0,
    RECENTLY_COMPLETED: 0,
    ALREADY_RECOMMENDED: 0,
    DIFFICULTY_MISMATCH: 0,
  };
}

function clampMasteryScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function isInsideTeacherScope(
  candidate: RecommendationCandidate,
  input: RecommendationAlgorithmInput,
): boolean {
  const scope = input.teacherScope;
  if (!scope.candidateQuestionIds.includes(candidate.id)) return false;
  if (scope.types.length > 0 && !scope.types.includes(candidate.type)) {
    return false;
  }
  if (
    scope.knowledgePointIds.length > 0 &&
    !candidate.knowledgePoints.some(
      (point) => point.isActive && scope.knowledgePointIds.includes(point.id),
    )
  ) {
    return false;
  }
  if (
    scope.tags.length > 0 &&
    !candidate.tags.some((tag) => scope.tags.includes(tag))
  ) {
    return false;
  }
  return true;
}

function filterCandidates(input: RecommendationAlgorithmInput): {
  candidates: RecommendationCandidate[];
  excludedCounts: Record<RecommendationExclusionReason, number>;
} {
  const excludedCounts = emptyExcludedCounts();
  const seen = new Set<string>();
  const recent = new Set(input.recentCompletedQuestionIds);
  const activeRecommendations = new Set(input.activeRecommendationQuestionIds);
  const candidates: RecommendationCandidate[] = [];

  for (const candidate of input.candidates) {
    if (seen.has(candidate.id)) {
      excludedCounts.DUPLICATE_CANDIDATE += 1;
      continue;
    }
    seen.add(candidate.id);

    if (
      candidate.status !== QuestionStatus.ACTIVE ||
      candidate.deletedAt !== null
    ) {
      excludedCounts.UNAVAILABLE += 1;
      continue;
    }
    if (
      candidate.creatorId !== input.teacherScope.teacherId &&
      candidate.visibility !== QuestionVisibility.PUBLIC
    ) {
      excludedCounts.UNAUTHORIZED += 1;
      continue;
    }
    if (!isInsideTeacherScope(candidate, input)) {
      excludedCounts.OUTSIDE_TEACHER_SCOPE += 1;
      continue;
    }
    if (recent.has(candidate.id)) {
      excludedCounts.RECENTLY_COMPLETED += 1;
      continue;
    }
    if (activeRecommendations.has(candidate.id)) {
      excludedCounts.ALREADY_RECOMMENDED += 1;
      continue;
    }
    if (Math.abs(candidate.difficulty - input.recommendedDifficulty) > 1) {
      excludedCounts.DIFFICULTY_MISMATCH += 1;
      continue;
    }
    candidates.push(candidate);
  }

  return { candidates, excludedCounts };
}

function scoreCandidates(
  candidates: RecommendationCandidate[],
  input: RecommendationAlgorithmInput,
): ScoredCandidate[] {
  const masteryByKnowledgePoint = new Map(
    input.knowledgeMasteries.map((mastery) => [
      mastery.knowledgePointId,
      clampMasteryScore(mastery.masteryScore),
    ]),
  );
  const weaknessByKnowledgePoint = new Map(
    input.weakKnowledgePoints.map((weakness) => [
      weakness.knowledgePointId,
      Math.max(1, Math.min(5, weakness.severity)),
    ]),
  );

  return candidates.map((candidate) => {
    const matchedKnowledgePoints = candidate.knowledgePoints
      .filter(
        (point) => point.isActive && weaknessByKnowledgePoint.has(point.id),
      )
      .map((point) => ({
        id: point.id,
        name: point.name,
        masteryScore: masteryByKnowledgePoint.get(point.id) ?? null,
      }))
      .sort(
        (left, right) =>
          (left.masteryScore ?? 101) - (right.masteryScore ?? 101) ||
          left.id.localeCompare(right.id),
      );

    const matchedScores = matchedKnowledgePoints.map((point) => {
      const severity = weaknessByKnowledgePoint.get(point.id) ?? 1;
      const deficit =
        point.masteryScore === null ? severity * 12 : 100 - point.masteryScore;
      return Math.round(deficit * 0.45 + severity * 2);
    });
    const weakKnowledgePointScore =
      matchedScores.length === 0
        ? 0
        : Math.min(
            60,
            Math.max(...matchedScores) +
              Math.min(10, (matchedScores.length - 1) * 5),
          );

    const difficultyDifference = Math.abs(
      candidate.difficulty - input.recommendedDifficulty,
    );
    const difficultyScore = difficultyDifference === 0 ? 15 : 8;
    let streakScore = 0;
    if (input.consecutiveWrong >= 3) {
      if (candidate.difficulty < input.recommendedDifficulty) {
        streakScore = 20;
      } else if (candidate.difficulty === input.recommendedDifficulty) {
        streakScore = 10;
      }
    }

    return {
      candidate,
      matchedKnowledgePoints,
      baseScore: weakKnowledgePointScore + difficultyScore + streakScore,
    };
  });
}

function adjustedSelectionScore(
  item: ScoredCandidate,
  selected: ScoredCandidate[],
): number {
  const sameTypeCount = selected.filter(
    (selectedItem) => selectedItem.candidate.type === item.candidate.type,
  ).length;
  const selectedKnowledgePointIds = new Set(
    selected.flatMap((selectedItem) =>
      selectedItem.matchedKnowledgePoints.map((point) => point.id),
    ),
  );
  const repeatedKnowledgePointCount = item.matchedKnowledgePoints.filter(
    (point) => selectedKnowledgePointIds.has(point.id),
  ).length;
  return item.baseScore - sameTypeCount * 12 - repeatedKnowledgePointCount * 4;
}

function selectBest(
  pool: ScoredCandidate[],
  selected: ScoredCandidate[],
  count: number,
): void {
  while (selected.length < count) {
    const selectedIds = new Set(selected.map((item) => item.candidate.id));
    const available = pool.filter(
      (item) => !selectedIds.has(item.candidate.id),
    );
    if (available.length === 0) return;
    available.sort(
      (left, right) =>
        adjustedSelectionScore(right, selected) -
          adjustedSelectionScore(left, selected) ||
        right.baseScore - left.baseScore ||
        left.candidate.id.localeCompare(right.candidate.id),
    );
    selected.push(available[0]);
  }
}

function ensureTypeDiversity(
  selected: ScoredCandidate[],
  allCandidates: ScoredCandidate[],
  protectedQuestionIds: Set<string>,
): boolean {
  if (selected.length <= 1) return false;
  const selectedTypes = new Set(selected.map((item) => item.candidate.type));
  const allTypes = new Set(allCandidates.map((item) => item.candidate.type));
  if (selectedTypes.size > 1 || allTypes.size <= 1) return false;

  const selectedIds = new Set(selected.map((item) => item.candidate.id));
  const replacement = allCandidates
    .filter(
      (item) =>
        !selectedIds.has(item.candidate.id) &&
        !selectedTypes.has(item.candidate.type),
    )
    .sort(
      (left, right) =>
        right.baseScore - left.baseScore ||
        left.candidate.id.localeCompare(right.candidate.id),
    )[0];
  if (!replacement) return false;
  const replaceIndex = selected.findLastIndex(
    (item) => !protectedQuestionIds.has(item.candidate.id),
  );
  selected[replaceIndex >= 0 ? replaceIndex : selected.length - 1] =
    replacement;
  return true;
}

function buildRecommendationItem(
  item: ScoredCandidate,
  input: RecommendationAlgorithmInput,
  rank: number,
): RecommendationItem {
  const reasons: string[] = [];
  const reasonCodes = new Set<RecommendationReasonCode>();
  const primaryKnowledgePoint = item.matchedKnowledgePoints[0] ?? null;

  if (primaryKnowledgePoint) {
    reasonCodes.add("WEAK_KNOWLEDGE_POINT");
    if (primaryKnowledgePoint.masteryScore === null) {
      reasons.push(`覆盖薄弱知识点“${primaryKnowledgePoint.name}”`);
    } else {
      reasonCodes.add("LOW_MASTERY");
      reasons.push(
        `覆盖薄弱知识点“${primaryKnowledgePoint.name}”，当前掌握度 ${primaryKnowledgePoint.masteryScore}%`,
      );
    }
  } else {
    reasonCodes.add("TEACHER_SCOPE");
    reasons.push("位于教师指定练习范围，可作为补充巩固练习");
  }

  reasonCodes.add("DIFFICULTY_MATCH");
  if (item.candidate.difficulty === input.recommendedDifficulty) {
    reasons.push(`难度 ${item.candidate.difficulty} 与推荐难度一致`);
  } else {
    reasons.push(
      `难度 ${item.candidate.difficulty} 与推荐难度相差 1，符合难度范围`,
    );
  }

  if (
    input.consecutiveWrong >= 3 &&
    item.candidate.difficulty <= input.recommendedDifficulty
  ) {
    reasonCodes.add("FOUNDATION_AFTER_WRONG_STREAK");
    reasons.push(`近期连续答错 ${input.consecutiveWrong} 道，优先安排基础巩固`);
  }
  if (
    input.consecutiveCorrect >= 3 &&
    item.candidate.difficulty === input.recommendedDifficulty + 1
  ) {
    reasonCodes.add("ADVANCED_AFTER_CORRECT_STREAK");
    reasons.push(
      `近期连续答对 ${input.consecutiveCorrect} 道，加入少量进阶练习`,
    );
  }
  const recentErrorType = input.recentErrorTypes[0];
  if (recentErrorType && primaryKnowledgePoint) {
    reasonCodes.add("RECENT_ERROR_PATTERN");
    reasons.push(`近期主要错误类型为${ERROR_TYPE_LABELS[recentErrorType]}`);
  }

  return {
    rank,
    questionId: item.candidate.id,
    title: item.candidate.title,
    type: item.candidate.type,
    difficulty: item.candidate.difficulty,
    score: item.baseScore,
    primaryKnowledgePointId: primaryKnowledgePoint?.id ?? null,
    matchedKnowledgePoints: item.matchedKnowledgePoints,
    reasonCodes: [...reasonCodes],
    reason: `${reasons.join("；")}。`,
  };
}

export function recommendQuestions(
  input: RecommendationAlgorithmInput,
): RecommendationAlgorithmResult {
  const { candidates, excludedCounts } = filterCandidates(input);
  const scoredCandidates = scoreCandidates(candidates, input);
  const selected: ScoredCandidate[] = [];
  const relaxedConstraints: string[] = [];
  const targetCount = Math.min(input.limit, scoredCandidates.length);

  if (input.consecutiveWrong >= 3) {
    const foundationPool = scoredCandidates.filter((item) =>
      input.recommendedDifficulty === 1
        ? item.candidate.difficulty === 1
        : item.candidate.difficulty < input.recommendedDifficulty,
    );
    const foundationTarget = Math.min(
      Math.ceil(targetCount * 0.6),
      foundationPool.length,
    );
    selectBest(foundationPool, selected, foundationTarget);
    if (targetCount > 0 && foundationTarget < Math.ceil(targetCount * 0.6)) {
      relaxedConstraints.push("基础题数量不足，已使用同难度题目补足");
    }
    selectBest(scoredCandidates, selected, targetCount);
  } else if (input.consecutiveCorrect >= 3 && targetCount >= 3) {
    const advancedPool = scoredCandidates.filter(
      (item) => item.candidate.difficulty === input.recommendedDifficulty + 1,
    );
    const corePool = scoredCandidates.filter(
      (item) => item.candidate.difficulty !== input.recommendedDifficulty + 1,
    );
    const advancedQuota = Math.min(
      Math.max(1, Math.floor(targetCount * 0.2)),
      advancedPool.length,
    );
    selectBest(corePool, selected, targetCount - advancedQuota);
    selectBest(
      advancedPool,
      selected,
      Math.min(targetCount, selected.length + advancedQuota),
    );
    if (selected.length < targetCount) {
      relaxedConstraints.push("常规题数量不足，已放宽进阶题比例");
      selectBest(scoredCandidates, selected, targetCount);
    }
  } else {
    selectBest(scoredCandidates, selected, targetCount);
  }

  const protectedAdvancedQuestionIds = new Set(
    input.consecutiveCorrect >= 3
      ? selected
          .filter(
            (item) =>
              item.candidate.difficulty === input.recommendedDifficulty + 1,
          )
          .map((item) => item.candidate.id)
      : [],
  );
  ensureTypeDiversity(selected, scoredCandidates, protectedAdvancedQuestionIds);
  const representedTypes = [
    ...new Set(selected.map((item) => item.candidate.type)),
  ];
  if (
    selected.length > 1 &&
    representedTypes.length === 1 &&
    new Set(scoredCandidates.map((item) => item.candidate.type)).size === 1
  ) {
    relaxedConstraints.push("候选题只有一种题型，无法进一步增加题型多样性");
  }

  const items = selected.map((item, index) =>
    buildRecommendationItem(item, input, index + 1),
  );
  return {
    items,
    metadata: {
      requestedCount: input.limit,
      returnedCount: items.length,
      excludedCounts,
      consecutiveCorrect: input.consecutiveCorrect,
      consecutiveWrong: input.consecutiveWrong,
      representedTypes,
      relaxedConstraints,
    },
  };
}
