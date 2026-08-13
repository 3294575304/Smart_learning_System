import {
  LearnerProfileEvidenceState,
  QuestionGraphBindingType,
} from "@prisma/client";

export interface CourseRecommendationPolicyWeights {
  weaknessWeight: number;
  prerequisiteWeight?: number;
  difficultyWeight: number;
  errorPatternWeight?: number;
  freshnessWeight: number;
  teacherPriorityWeight?: number;
  difficultyTolerance: number;
}

export interface CourseRecommendationProfileInput {
  conceptId: string;
  evidenceState: LearnerProfileEvidenceState;
  masteryScore: number | null;
}

export interface CourseRecommendationCandidateInput<TQuestion> {
  question: TQuestion & { id: string; difficulty: number };
  bindings: Array<{
    conceptId: string;
    bindingType: QuestionGraphBindingType;
    conceptName: string;
  }>;
  prerequisiteGap?: boolean;
  recentErrorMatch?: boolean;
  teacherPriority?: boolean;
}

export interface ScoredCourseRecommendation<TQuestion> {
  question: TQuestion & { id: string; difficulty: number };
  targetConceptId: string;
  score: number;
  reasonCodes: string[];
  reason: string;
}

export function rankCourseRecommendationCandidates<TQuestion>(input: {
  candidates: Array<CourseRecommendationCandidateInput<TQuestion>>;
  profiles: CourseRecommendationProfileInput[];
  requestedDifficulty: number;
  policy: CourseRecommendationPolicyWeights;
  limit: number;
}): Array<ScoredCourseRecommendation<TQuestion>> {
  const profileByConcept = new Map(
    input.profiles.map((item) => [item.conceptId, item]),
  );
  return input.candidates
    .map((candidate) => {
      const primary =
        candidate.bindings.find(
          (binding) => binding.bindingType === QuestionGraphBindingType.PRIMARY,
        ) ?? candidate.bindings[0];
      if (!primary) return null;
      const profile = profileByConcept.get(primary.conceptId);
      const evidenceState =
        profile?.evidenceState ?? LearnerProfileEvidenceState.NO_EVIDENCE;
      const masteryScore = profile?.masteryScore ?? null;
      const diagnostic =
        evidenceState !== LearnerProfileEvidenceState.CONCLUSIVE;
      const weakness = diagnostic ? 15 : Math.max(0, 100 - (masteryScore ?? 0));
      const difficultyFit =
        1 -
        Math.abs(candidate.question.difficulty - input.requestedDifficulty) /
          Math.max(1, input.policy.difficultyTolerance + 1);
      const score = Math.round(
        weakness * (input.policy.weaknessWeight / 100) +
          (candidate.prerequisiteGap ? 100 : 0) *
            ((input.policy.prerequisiteWeight ?? 0) / 100) +
          difficultyFit * input.policy.difficultyWeight +
          (candidate.recentErrorMatch ? 100 : 0) *
            ((input.policy.errorPatternWeight ?? 0) / 100) +
          input.policy.freshnessWeight +
          (candidate.teacherPriority ? 100 : 0) *
            ((input.policy.teacherPriorityWeight ?? 0) / 100),
      );
      const supplementalCodes = [
        ...(candidate.prerequisiteGap ? ["PREREQUISITE_GAP"] : []),
        ...(candidate.recentErrorMatch ? ["RECENT_ERROR_MATCH"] : []),
        ...(candidate.teacherPriority ? ["TEACHER_PRIORITY"] : []),
      ];
      return {
        question: candidate.question,
        targetConceptId: primary.conceptId,
        score,
        reasonCodes: diagnostic
          ? [
              "COURSE_SCOPE",
              "TEACHING_PROGRESS",
              "DIAGNOSTIC_EVIDENCE",
              "DIFFICULTY_MATCH",
              ...supplementalCodes,
            ]
          : [
              "COURSE_SCOPE",
              "TEACHING_PROGRESS",
              "LOW_MASTERY",
              "DIFFICULTY_MATCH",
              ...supplementalCodes,
            ],
        reason: diagnostic
          ? `“${primary.conceptName}”当前证据不足，本题用于补充诊断证据；难度与所选范围匹配。${candidate.prerequisiteGap ? "同时优先补足先修缺口。" : ""}${candidate.teacherPriority ? "该题属于教师重点。" : ""}`
          : `“${primary.conceptName}”当前掌握度 ${masteryScore ?? 0}%，本题用于针对性巩固；难度与所选范围匹配。${candidate.recentErrorMatch ? "近期同知识点错误提高了本题优先级。" : ""}${candidate.teacherPriority ? "该题属于教师重点。" : ""}`,
      };
    })
    .filter(
      (item): item is ScoredCourseRecommendation<TQuestion> => item !== null,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.question.difficulty - right.question.difficulty ||
        left.question.id.localeCompare(right.question.id),
    )
    .slice(0, input.limit);
}
