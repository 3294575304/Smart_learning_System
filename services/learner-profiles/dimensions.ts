import { LearnerProfileEvidenceState, LearningEventType } from "@prisma/client";

import { learnerProfileEvidenceState } from "@/services/learner-profiles/calculation";
import { ACTIVITY_WINDOW_DAYS } from "@/services/learner-profiles/constants";

export type ProfileDimensionSourceStatus = "COLLECTED" | "NOT_COLLECTED";

/**
 * 画像里的「活跃度」只统计评分类学习事件（作业评分 / 练习评分）。
 * 它是一个辅助维度：能说明「最近有没有在学」，但不能推断努力程度，
 * 更不能进入掌握度或达成度计算。
 */
export interface ActivityDimension {
  evidenceState: LearnerProfileEvidenceState;
  evidenceCount: number;
  sourceStatus: ProfileDimensionSourceStatus;
  windowDays: number;
  activeDays: number;
  gradedEventCount: number;
  assignmentEventCount: number;
  practiceEventCount: number;
  lastActiveAt: string | null;
  conclusion: string | null;
  updatedAt: string | null;
}

/**
 * 「自我反思」是学生自述，不是客观证据。
 * 一条已确认的自述本身就构成「学生这样描述自己」的结论，
 * 所以 evidenceState 不从 3 条起步；UI 上必须与客观维度区分底色。
 */
export interface ReflectionDimension {
  evidenceState: LearnerProfileEvidenceState;
  evidenceCount: number;
  sourceStatus: ProfileDimensionSourceStatus;
  subjective: true;
  confirmedCount: number;
  latestConfirmedAt: string | null;
  latestWordCount: number | null;
  topics: string[];
  conclusion: string | null;
  updatedAt: string | null;
}

/** 编程判题结果只出汇总（次数 / 通过数），不下发隐藏用例与报错细节。 */
export interface ProgrammingDimension {
  evidenceState: LearnerProfileEvidenceState;
  evidenceCount: number;
  sourceStatus: ProfileDimensionSourceStatus;
  attemptCount: number;
  /** 参与通过率计算的最近判题次数（避免一次拉全部历史）。 */
  sampledCount: number;
  passedCount: number;
  passRate: number | null;
  lastAttemptAt: string | null;
  conclusion: string | null;
  updatedAt: string | null;
}

export const emptyActivityDimension = (): ActivityDimension => ({
  evidenceState: LearnerProfileEvidenceState.NO_EVIDENCE,
  evidenceCount: 0,
  sourceStatus: "COLLECTED",
  windowDays: ACTIVITY_WINDOW_DAYS,
  activeDays: 0,
  gradedEventCount: 0,
  assignmentEventCount: 0,
  practiceEventCount: 0,
  lastActiveAt: null,
  conclusion: null,
  updatedAt: null,
});

export function buildActivityDimension(input: {
  events: Array<{
    id: string;
    eventType: LearningEventType;
    occurredAt: Date;
  }>;
  now?: Date;
}): ActivityDimension {
  const now = input.now ?? new Date();
  const since = new Date(
    now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const events = input.events
    .filter((event) => event.occurredAt >= since)
    .sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    );
  const activeDays = new Set(
    events.map((event) => event.occurredAt.toISOString().slice(0, 10)),
  ).size;
  const assignmentEventCount = events.filter(
    (event) => event.eventType === LearningEventType.ASSESSMENT_GRADED,
  ).length;
  const practiceEventCount = events.filter(
    (event) =>
      event.eventType === LearningEventType.RECOMMENDATION_PRACTICE_GRADED,
  ).length;
  const gradedEventCount = assignmentEventCount + practiceEventCount;
  const lastActiveAt = events[0]?.occurredAt.toISOString() ?? null;
  const evidenceState = learnerProfileEvidenceState(gradedEventCount);
  return {
    evidenceState,
    evidenceCount: gradedEventCount,
    sourceStatus: "COLLECTED",
    windowDays: ACTIVITY_WINDOW_DAYS,
    activeDays,
    gradedEventCount,
    assignmentEventCount,
    practiceEventCount,
    lastActiveAt,
    conclusion:
      gradedEventCount === 0
        ? null
        : `近 ${ACTIVITY_WINDOW_DAYS} 天有 ${activeDays} 天产生评分记录，共 ${gradedEventCount} 次（作业 ${assignmentEventCount} 次 / 练习 ${practiceEventCount} 次）。`,
    updatedAt: lastActiveAt,
  };
}

export function buildReflectionDimension(input: {
  confirmedCount: number;
  latest: {
    id: string;
    confirmedAt: Date | null;
    updatedAt: Date;
    inputText: string;
    summary: string;
    goals: string[];
    difficulties: string[];
  } | null;
}): ReflectionDimension {
  const latest = input.latest;
  const topics = latest
    ? [...latest.goals, ...latest.difficulties]
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return {
    evidenceState:
      input.confirmedCount === 0
        ? LearnerProfileEvidenceState.NO_EVIDENCE
        : LearnerProfileEvidenceState.CONCLUSIVE,
    evidenceCount: input.confirmedCount,
    sourceStatus: "COLLECTED",
    subjective: true,
    confirmedCount: input.confirmedCount,
    latestConfirmedAt: latest?.confirmedAt?.toISOString() ?? null,
    latestWordCount: latest ? latest.inputText.trim().length : null,
    topics,
    conclusion: latest
      ? topics.length
        ? `最近一次自述提到：${topics.join("、")}。`
        : latest.summary.slice(0, 60) || "已确认一条学习自述。"
      : null,
    updatedAt:
      latest?.confirmedAt?.toISOString() ??
      latest?.updatedAt.toISOString() ??
      null,
  };
}

export function buildProgrammingDimension(input: {
  total: number;
  attempts: Array<{
    id: string;
    score: number | null;
    maxScore: number | null;
    completedAt: Date | null;
    createdAt: Date;
  }>;
}): ProgrammingDimension {
  const passedCount = input.attempts.filter(
    (attempt) =>
      attempt.maxScore !== null &&
      attempt.maxScore > 0 &&
      attempt.score !== null &&
      attempt.score >= attempt.maxScore,
  ).length;
  const lastAttemptAt = input.attempts
    .map((attempt) => attempt.completedAt ?? attempt.createdAt)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const evidenceState = learnerProfileEvidenceState(input.total);
  return {
    evidenceState,
    evidenceCount: input.total,
    sourceStatus: "COLLECTED",
    attemptCount: input.total,
    sampledCount: input.attempts.length,
    passedCount,
    passRate:
      input.attempts.length > 0
        ? Math.round((passedCount / input.attempts.length) * 100)
        : null,
    lastAttemptAt: lastAttemptAt?.toISOString() ?? null,
    conclusion:
      input.total === 0
        ? null
        : `正式判题 ${input.total} 次，最近 ${input.attempts.length} 次中 ${passedCount} 次满分通过。`,
    updatedAt: lastAttemptAt?.toISOString() ?? null,
  };
}
