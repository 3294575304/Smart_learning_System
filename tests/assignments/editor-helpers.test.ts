import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  distributeAssignmentPoints,
  distributePointsByType,
  selectAssignmentQuestions,
} from "@/services/assignments/editor-helpers";
import { latestEffectiveSubmissions } from "@/services/assignments/latest-submissions";
import { assignmentBatchSchema } from "@/services/assignments/schemas";
import { summarizeDashboardAssignmentTodo } from "@/services/dashboard/teacher-dashboard-metrics";

test("point distribution preserves exact cents and never creates zero-point questions", () => {
  assert.deepEqual(distributeAssignmentPoints(3, 100), [33.34, 33.33, 33.33]);
  for (const count of [1, 3, 7, 200])
    assert.equal(
      distributeAssignmentPoints(count, 100).reduce(
        (sum, value) => sum + Math.round(value * 100),
        0,
      ),
      10000,
    );
  for (const [count, total] of [
    [3, 0.02],
    [0, 100],
    [2, 1.001],
    [201, 100],
    [2, NaN],
  ])
    assert.throws(() => distributeAssignmentPoints(count, total));
});

test("one-click selection respects candidates and exclusion, deduplicates and does not silently underfill", () => {
  const items = [{ id: "a" }, { id: "a" }, { id: "b" }, { id: "c" }];
  const result = selectAssignmentQuestions(items, ["b"], 2, () => 0.5);
  assert.deepEqual(new Set(result.map((item) => item.id)), new Set(["a", "c"]));
  assert.equal(items.length, 4);
  assert.throws(() => selectAssignmentQuestions(items, ["b"], 3));
  assert.throws(() => selectAssignmentQuestions(items, [], 0));
});

test("batch schemas reject duplicate classes, absent primary classes and oversized file lists", () => {
  const first = "cmf00000000000000000000001";
  const second = "cmf00000000000000000000002";
  const base = {
    requestId: randomUUID(),
    classroomIds: [first, second],
    publish: true,
    assignment: {
      title: "实验任务",
      classroomId: first,
      questions: [],
      submissionTask: { prompt: "提交实验报告", points: 100 },
    },
  };
  assert.equal(assignmentBatchSchema.safeParse(base).success, true);
  assert.equal(
    assignmentBatchSchema.safeParse({ ...base, classroomIds: [first, first] })
      .success,
    false,
  );
  assert.equal(
    assignmentBatchSchema.safeParse({ ...base, classroomIds: [second] })
      .success,
    false,
  );
  assert.equal(
    assignmentBatchSchema.safeParse({
      ...base,
      assignment: {
        ...base.assignment,
        submissionTask: {
          ...base.assignment.submissionTask,
          resourceFileIds: Array(6).fill(first),
        },
      },
    }).success,
    false,
  );
});

test("publication and todos only consume latest effective attempts, preserving historical pending work", () => {
  const base = {
    studentId: "student",
    submittedAt: new Date(),
    score: 80,
    maxScore: 100,
    gradedAt: new Date(),
    manualAnswerCount: 0,
  };
  const old = {
    ...base,
    id: "old",
    attemptNumber: 1,
    status: "PENDING_REVIEW",
    manualAnswerCount: 1,
  };
  const current = {
    ...base,
    id: "current",
    attemptNumber: 2,
    status: "GRADED",
  };
  assert.deepEqual(
    summarizeDashboardAssignmentTodo(
      latestEffectiveSubmissions([old, current]),
    ),
    { pendingReviewCount: 0, publishableCount: 1 },
  );
  assert.deepEqual(
    summarizeDashboardAssignmentTodo(
      latestEffectiveSubmissions([old, { ...current, status: "PUBLISHED" }]),
    ),
    { pendingReviewCount: 0, publishableCount: 0 },
  );
  assert.deepEqual(
    summarizeDashboardAssignmentTodo(
      latestEffectiveSubmissions([
        current,
        { ...old, id: "new", attemptNumber: 3 },
      ]),
    ),
    { pendingReviewCount: 1, publishableCount: 0 },
  );
});

test("typed subtotals allocate exact cents and preserve locked items", () => {
  const questions = [
    { id: "a", type: "choice", points: 10 },
    { id: "b", type: "choice", points: 10 },
    { id: "c", type: "choice", points: 10 },
    { id: "d", type: "written", points: 7 },
  ] as const;
  assert.deepEqual(
    distributePointsByType(questions, 100, { choice: 39.99, written: 60.01 }, [
      "a",
    ]),
    [10, 15, 14.99, 60.01],
  );
  assert.throws(
    () =>
      distributePointsByType(questions, 100, { choice: 30, written: 50 }, []),
    /目标总分/,
  );
  assert.throws(
    () =>
      distributePointsByType(questions, 100, { choice: 9, written: 91 }, ["a"]),
    /锁定/,
  );
  assert.throws(
    () =>
      distributePointsByType(questions, 100, { choice: 35, written: 65 }, [
        "a",
        "b",
        "c",
      ]),
    /锁定/,
  );
});
