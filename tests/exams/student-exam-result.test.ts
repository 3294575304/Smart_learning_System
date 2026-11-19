import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveExamRowState,
  examScoreView,
  formatScore,
  latestEffectiveAttempt,
  type ExamAttempt,
} from "../../services/exams/exam-state";

const attempt = (
  id: string,
  attemptNumber: number,
  status: ExamAttempt["status"],
  score: number | null,
  submittedAt: Date | null = new Date("2026-11-13T02:00:00Z"),
): ExamAttempt => ({
  id,
  attemptNumber,
  status,
  submittedAt,
  score,
  maxScore: 100,
});

test("计分取最新一次有效作答，而不是最高分或第一次", () => {
  const latest = latestEffectiveAttempt([
    attempt("a1", 1, "PUBLISHED", 95),
    attempt("a2", 2, "PUBLISHED", 62),
  ]);
  assert.equal(latest?.id, "a2");
});

test("作答中的那次不参与计分，仍取上一个有效作答", () => {
  const latest = latestEffectiveAttempt([
    attempt("a1", 1, "PUBLISHED", 88),
    attempt("a2", 2, "IN_PROGRESS", null, null),
  ]);
  assert.equal(latest?.id, "a1");
});

test("同一作答序号按提交时间与 id 兜底，保证结果确定", () => {
  const latest = latestEffectiveAttempt([
    attempt("a1", 1, "SUBMITTED", 70, new Date("2026-11-13T01:00:00Z")),
    attempt("a2", 1, "SUBMITTED", 70, new Date("2026-11-13T02:00:00Z")),
  ]);
  assert.equal(latest?.id, "a2");
});

test("已截止且无提交只表示「无交卷记录」，不推断缺考", () => {
  const state = deriveExamRowState({
    now: new Date("2026-11-14T00:00:00Z"),
    startsAt: new Date("2026-11-13T00:00:00Z"),
    dueAt: new Date("2026-11-13T02:00:00Z"),
    writable: false,
    special: null,
    graded: false,
    hasEffective: false,
    remainingAttempts: 1,
  });
  assert.equal(state, "CLOSED_NO_SUBMISSION");
});

test("教师登记缺考时，即使没有提交也显示为已登记状态", () => {
  const state = deriveExamRowState({
    now: new Date("2026-11-20T00:00:00Z"),
    startsAt: new Date("2026-11-13T00:00:00Z"),
    dueAt: new Date("2026-11-13T02:00:00Z"),
    writable: false,
    special: "ABSENT",
    graded: false,
    hasEffective: false,
    remainingAttempts: 0,
  });
  assert.equal(state, "SPECIAL");
});

test("已交卷但仍有次数且未截止，才算可重考", () => {
  const base = {
    now: new Date("2026-11-13T01:00:00Z"),
    startsAt: new Date("2026-11-13T00:00:00Z"),
    dueAt: new Date("2026-11-13T02:00:00Z"),
    special: null,
    graded: false,
    hasEffective: true,
  };
  assert.equal(
    deriveExamRowState({ ...base, writable: true, remainingAttempts: 1 }),
    "RETAKEABLE",
  );
  assert.equal(
    deriveExamRowState({ ...base, writable: false, remainingAttempts: 1 }),
    "AWAITING_SCORE",
  );
  assert.equal(
    deriveExamRowState({ ...base, writable: true, remainingAttempts: 0 }),
    "AWAITING_SCORE",
  );
});

test("已出分但仍有次数且未截止时，允许再次作答", () => {
  const base = {
    now: new Date("2026-11-13T01:00:00Z"),
    startsAt: new Date("2026-11-13T00:00:00Z"),
    dueAt: new Date("2026-11-13T02:00:00Z"),
    special: null,
    graded: true,
    hasEffective: true,
  };
  assert.equal(
    deriveExamRowState({ ...base, writable: true, remainingAttempts: 1 }),
    "SCORED_RETAKEABLE",
  );
  assert.equal(
    deriveExamRowState({ ...base, writable: true, remainingAttempts: 0 }),
    "SCORED",
    "次数用完就是终态",
  );
  assert.equal(
    deriveExamRowState({ ...base, writable: false, remainingAttempts: 1 }),
    "SCORED",
    "退课/归档只读时不再给重考入口",
  );
  assert.equal(
    deriveExamRowState({
      ...base,
      now: new Date("2026-11-13T03:00:00Z"),
      writable: true,
      remainingAttempts: 1,
    }),
    "SCORED",
    "已截止不能再开新作答",
  );
  assert.equal(
    deriveExamRowState({
      ...base,
      writable: true,
      hasEffective: false,
      remainingAttempts: 2,
    }),
    "SCORED",
    "台账直接给分、没有个人提交时不推断可重考",
  );
});

test("成绩以台账为准，台账未计分时回退到已公布的提交", () => {
  const published = attempt("a1", 1, "PUBLISHED", 80);
  assert.deepEqual(
    examScoreView({ status: "SCORED", score: 92, maxScore: 100 }, published),
    {
      score: 92,
      maxScore: 100,
      percentage: 92,
      source: "LEDGER",
      attemptNumber: 1,
    },
  );
  assert.equal(examScoreView(undefined, published)?.score, 80);
  assert.equal(
    examScoreView(undefined, attempt("a1", 1, "GRADED", 80)),
    null,
    "未公布分数不应提前露出",
  );
});

test("成绩格式化不额外补小数", () => {
  assert.equal(formatScore(92), "92");
  assert.equal(formatScore(91.25), "91.3");
  assert.equal(formatScore(null), "—");
});
