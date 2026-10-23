import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeAssignmentParticipation,
  summarizeAssignmentRates,
  summarizeAssignmentRatesByClass,
  type DashboardAssignmentAttempt,
} from "@/services/dashboard/teacher-assignment-metrics";

test("class bars combine every assignment per class and keep missing classes unassessed", () => {
  const rows = summarizeAssignmentRatesByClass(
    [
      { id: "a", name: "一班" },
      { id: "b", name: "二班" },
      { id: "empty", name: "暂无作业班" },
    ],
    [
      {
        classroomId: "a",
        expectedCount: 1,
        completedCount: 1,
        judgedCount: 1,
        correctCount: 1,
      },
      {
        classroomId: "a",
        expectedCount: 9,
        completedCount: 0,
        judgedCount: 9,
        correctCount: 0,
      },
      {
        classroomId: "b",
        expectedCount: 2,
        completedCount: 1,
        judgedCount: 4,
        correctCount: 3,
      },
      {
        classroomId: "foreign",
        expectedCount: 100,
        completedCount: 100,
        judgedCount: 100,
        correctCount: 100,
      },
    ],
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].assignmentCount, 2);
  assert.equal(rows[0].completionRate, 10);
  assert.equal(rows[0].accuracyRate, 10);
  assert.equal(rows[1].completionRate, 50);
  assert.equal(rows[1].accuracyRate, 75);
  assert.equal(rows[2].completionRate, null);
  assert.equal(rows[2].accuracyRate, null);
  assert.equal(summarizeAssignmentRates(rows).completionRate, 16.7);
});

const attempt = (
  changes: Partial<DashboardAssignmentAttempt> = {},
): DashboardAssignmentAttempt => ({
  id: "first",
  studentId: "student",
  attemptNumber: 1,
  submittedAt: new Date("2026-10-01T00:00:00Z"),
  status: "GRADED",
  judgedCount: 4,
  correctCount: 3,
  ...changes,
});

test("participation uses the latest effective attempt per current member, ignoring drafts, withdrawals and outsiders", () => {
  assert.deepEqual(
    summarizeAssignmentParticipation(
      ["student", "student", "second"],
      [
        attempt(),
        attempt({
          id: "latest",
          attemptNumber: 2,
          status: "PENDING_REVIEW",
          judgedCount: 2,
          correctCount: 0,
        }),
        attempt({ id: "draft", attemptNumber: 3, status: "IN_PROGRESS" }),
        attempt({ id: "withdrawn", attemptNumber: 4, status: "WITHDRAWN" }),
        attempt({ id: "outsider", studentId: "outsider" }),
      ],
    ),
    { expectedCount: 2, completedCount: 1, judgedCount: 2, correctCount: 0 },
  );
});

test("latest selection is deterministic on attempt, submission time and id regardless of input order", () => {
  const rows = [
    attempt({ id: "b", correctCount: 2 }),
    attempt({ id: "a", correctCount: 1 }),
    attempt({
      id: "c",
      submittedAt: new Date("2026-09-01T00:00:00Z"),
      correctCount: 0,
    }),
  ];
  assert.equal(
    summarizeAssignmentParticipation(["student"], rows).correctCount,
    2,
  );
  assert.deepEqual(
    summarizeAssignmentParticipation(["student"], rows),
    summarizeAssignmentParticipation(["student"], rows.toReversed()),
  );
});

test("all-class rates aggregate person-task and judged-answer totals instead of averaging class percentages", () => {
  const result = summarizeAssignmentRates([
    { expectedCount: 1, completedCount: 1, judgedCount: 1, correctCount: 1 },
    { expectedCount: 9, completedCount: 0, judgedCount: 9, correctCount: 0 },
  ]);
  assert.equal(result.completionRate, 10);
  assert.equal(result.accuracyRate, 10);
});

test("unsubmitted work is zero completion, ungraded work stays unknown accuracy and empty classes stay unknown", () => {
  const emptyClass = summarizeAssignmentParticipation([], [attempt()]);
  assert.equal(summarizeAssignmentRates([emptyClass]).completionRate, null);
  const notSubmitted = summarizeAssignmentParticipation(["student"], []);
  assert.equal(summarizeAssignmentRates([notSubmitted]).completionRate, 0);
  assert.equal(summarizeAssignmentRates([notSubmitted]).accuracyRate, null);
  const pending = summarizeAssignmentParticipation(
    ["student"],
    [attempt({ status: "SUBMITTED", judgedCount: 0, correctCount: 0 })],
  );
  assert.equal(summarizeAssignmentRates([pending]).completionRate, 100);
  assert.equal(summarizeAssignmentRates([pending]).accuracyRate, null);
  assert.equal(
    summarizeAssignmentRates([{ ...pending, judgedCount: 3, correctCount: 0 }])
      .accuracyRate,
    0,
  );
});
