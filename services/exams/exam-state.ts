import type { SubmissionStatus } from "@prisma/client";

/**
 * 学生考试记录的状态与取分规则（纯函数，无数据库依赖）。
 *
 * 两条已确认规则在这里落地，列表、考试记录、考试报告必须共用：
 * 1. 多次作答时，计分取「最新一次有效作答」——不是最高分，也不是第一次。
 * 2. 缺考只能来自教师成绩台账的登记，不能由「没有提交」推断。
 */

/** 成绩台账里会被学生端展示的登记状态。 */
export const examSpecialStatuses = [
  "ABSENT",
  "DEFERRED",
  "LEAVE",
  "EXEMPT",
  "CHEATING",
  "OTHER",
] as const;

export type ExamSpecialStatus = (typeof examSpecialStatuses)[number];

const specialStatusLabels: Record<ExamSpecialStatus, string> = {
  ABSENT: "缺考（教师已登记）",
  DEFERRED: "缓考（教师已登记）",
  LEAVE: "请假（教师已登记）",
  EXEMPT: "免修（教师已登记）",
  // 直接向学生展示「作弊」风险过高，统一交给教师说明。
  CHEATING: "成绩状态待教师说明",
  OTHER: "成绩状态待教师说明",
};

export function isExamSpecialStatus(
  status: string | null | undefined,
): status is ExamSpecialStatus {
  return Boolean(
    status && (examSpecialStatuses as readonly string[]).includes(status),
  );
}

export function examSpecialStatusLabel(status: string | null | undefined) {
  return isExamSpecialStatus(status) ? specialStatusLabels[status] : null;
}

export type ExamRowState =
  | "UPCOMING"
  | "IN_PROGRESS"
  | "RETAKEABLE"
  | "SCORED_RETAKEABLE"
  | "AWAITING_SCORE"
  | "SCORED"
  | "CLOSED_NO_SUBMISSION"
  | "SPECIAL";

export const examStateLabels: Record<ExamRowState, string> = {
  UPCOMING: "待开考",
  IN_PROGRESS: "进行中",
  RETAKEABLE: "已交卷 · 可重考",
  SCORED_RETAKEABLE: "已出分 · 可重考",
  AWAITING_SCORE: "已交卷 · 待出分",
  SCORED: "已出分",
  CLOSED_NO_SUBMISSION: "已截止 · 无交卷记录",
  SPECIAL: "已登记",
};

export const examStateGroupOrder: Record<ExamRowState, number> = {
  IN_PROGRESS: 0,
  RETAKEABLE: 1,
  SCORED_RETAKEABLE: 2,
  UPCOMING: 3,
  AWAITING_SCORE: 4,
  SCORED: 5,
  SPECIAL: 6,
  CLOSED_NO_SUBMISSION: 7,
};

export const examStateGroupLabels: Record<ExamRowState, string> = {
  IN_PROGRESS: "进行中",
  RETAKEABLE: "可重考",
  SCORED_RETAKEABLE: "已出分 · 可重考",
  UPCOMING: "待开考",
  AWAITING_SCORE: "已交卷待出分",
  SCORED: "已出分",
  SPECIAL: "已登记成绩状态",
  CLOSED_NO_SUBMISSION: "已截止",
};

type MaybeDecimal = { toNumber(): number } | number | null | undefined;

function toNumber(value: MaybeDecimal): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = value.toNumber();
  return Number.isFinite(parsed) ? parsed : null;
}

export type ExamAttempt = {
  id: string;
  status: SubmissionStatus;
  attemptNumber: number;
  submittedAt: Date | null;
  score: MaybeDecimal;
  maxScore: MaybeDecimal;
};

const effectiveStatuses = new Set<SubmissionStatus>([
  "SUBMITTED",
  "PENDING_REVIEW",
  "GRADED",
  "PUBLISHED",
]);

export function isEffectiveAttempt(attempt: { status: SubmissionStatus }) {
  return effectiveStatuses.has(attempt.status);
}

/** 最新一次有效作答：先比作答序号，再比提交时间，最后用 id 兜底保证确定性。 */
export function latestEffectiveAttempt<T extends ExamAttempt>(
  attempts: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const attempt of attempts) {
    if (!isEffectiveAttempt(attempt)) continue;
    if (!latest) {
      latest = attempt;
      continue;
    }
    if (attempt.attemptNumber !== latest.attemptNumber) {
      if (attempt.attemptNumber > latest.attemptNumber) latest = attempt;
      continue;
    }
    const time = attempt.submittedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const latestTime =
      latest.submittedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (
      time > latestTime ||
      (time === latestTime && attempt.id.localeCompare(latest.id) > 0)
    )
      latest = attempt;
  }
  return latest;
}

export type ExamLedgerEntry = {
  status: string;
  score: number | null;
  maxScore: number;
};

export function deriveExamRowState(input: {
  now: Date;
  startsAt: Date;
  dueAt: Date;
  writable: boolean;
  special: ExamSpecialStatus | null;
  graded: boolean;
  hasEffective: boolean;
  remainingAttempts: number;
}): ExamRowState {
  // 登记优先：教师说缺考就是缺考，不再看有没有提交。
  if (input.special) return "SPECIAL";
  if (input.graded) {
    // 已出分不等于结束：只要还有剩余次数且仍在窗口内，就允许再次作答。
    const retakeable =
      input.hasEffective &&
      input.writable &&
      input.remainingAttempts > 0 &&
      input.now < input.dueAt;
    return retakeable ? "SCORED_RETAKEABLE" : "SCORED";
  }
  if (!input.hasEffective && input.now >= input.dueAt)
    return "CLOSED_NO_SUBMISSION";
  if (!input.hasEffective && !input.writable) return "CLOSED_NO_SUBMISSION";
  if (input.now < input.startsAt) return "UPCOMING";
  if (input.hasEffective)
    return input.remainingAttempts > 0 &&
      input.writable &&
      input.now < input.dueAt
      ? "RETAKEABLE"
      : "AWAITING_SCORE";
  return "IN_PROGRESS";
}

export type ExamScoreView = {
  score: number;
  maxScore: number;
  percentage: number | null;
  source: "LEDGER" | "SUBMISSION";
  attemptNumber: number | null;
};

export function examScoreView(
  ledger: Pick<ExamLedgerEntry, "status" | "score" | "maxScore"> | undefined,
  latest: ExamAttempt | null,
): ExamScoreView | null {
  const fromSubmission = () => {
    if (!latest || latest.status !== "PUBLISHED") return null;
    const score = toNumber(latest.score);
    const maxScore = toNumber(latest.maxScore);
    if (score === null || maxScore === null || maxScore <= 0) return null;
    return {
      score,
      maxScore,
      percentage: Math.round((score / maxScore) * 1000) / 10,
      source: "SUBMISSION" as const,
      attemptNumber: latest.attemptNumber,
    };
  };
  if (ledger?.status === "SCORED" && ledger.score !== null) {
    return {
      score: ledger.score,
      maxScore: ledger.maxScore,
      percentage:
        ledger.maxScore > 0
          ? Math.round((ledger.score / ledger.maxScore) * 1000) / 10
          : null,
      source: "LEDGER",
      attemptNumber: latest?.attemptNumber ?? null,
    };
  }
  return fromSubmission();
}

/** 成绩卡与列表共用的格式化：整数不补小数，其余保留一位。 */
export function formatScore(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
