import { QuestionStatus } from "@prisma/client";

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

    return {
      candidate,
      matchedKnowledgePoints,
      baseScore:
        weakKnowledgePointScore +
        (input.consecutiveWrong >= 3 && matchedKnowledgePoints.length ? 10 : 0),
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

  if (input.consecutiveWrong >= 3 && primaryKnowledgePoint) {
    reasonCodes.add("FOUNDATION_AFTER_WRONG_STREAK");
    reasons.push(
      `近期连续答错 ${input.consecutiveWrong} 道，优先复习相关知识点`,
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

  selectBest(scoredCandidates, selected, targetCount);
  ensureTypeDiversity(selected, scoredCandidates, new Set());
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
