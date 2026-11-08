export const COURSE_RECOMMENDATION_RULE_VERSION = "course-recommendation-v2";

export const DEFAULT_COURSE_RECOMMENDATION_POLICY = {
  weaknessWeight: 50,
  prerequisiteWeight: 20,
  difficultyWeight: 0,
  errorPatternWeight: 10,
  freshnessWeight: 10,
  teacherPriorityWeight: 10,
  recentWindowDays: 14,
  difficultyTolerance: 0,
  maxQuestionCount: 20,
} as const;
