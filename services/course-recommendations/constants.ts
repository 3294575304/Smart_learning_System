export const COURSE_RECOMMENDATION_RULE_VERSION = "course-recommendation-v1";

export const DEFAULT_COURSE_RECOMMENDATION_POLICY = {
  weaknessWeight: 35,
  prerequisiteWeight: 20,
  difficultyWeight: 15,
  errorPatternWeight: 10,
  freshnessWeight: 10,
  teacherPriorityWeight: 10,
  recentWindowDays: 14,
  difficultyTolerance: 1,
  maxQuestionCount: 20,
} as const;
