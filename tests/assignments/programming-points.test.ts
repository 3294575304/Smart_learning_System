import assert from "node:assert/strict";
import test from "node:test";
import { distributeAssignmentPointsByType } from "../../services/assignments/editor-helpers";

test("four ten-point programming configurations fill a hundred-point assignment", () => {
  const questions = Array.from({ length: 4 }, () => ({
    type: "PYTHON_PROGRAMMING",
    programmingTotalPoints: 10,
  }));
  assert.deepEqual(
    distributeAssignmentPointsByType(questions, 100),
    [25, 25, 25, 25],
  );
});

test("mixed assignments allocate sixty percent to big questions and forty to small ones", () => {
  const questions = [
    { type: "PYTHON_PROGRAMMING", programmingTotalPoints: 10 },
    { type: "SHORT_ANSWER" },
    { type: "SINGLE_CHOICE" },
    { type: "FILL_BLANK" },
  ];
  assert.deepEqual(
    distributeAssignmentPointsByType(questions, 100),
    [30, 30, 20, 20],
  );
});

test("programming-only allocation preserves exact totals with integer scores where possible", () => {
  for (const count of [1, 3, 4, 7]) {
    const points = distributeAssignmentPointsByType(
      Array.from({ length: count }, () => ({
        type: "PYTHON_PROGRAMMING",
        programmingTotalPoints: 10,
      })),
      100,
    );
    assert.equal(
      points.reduce((sum, p) => sum + Math.round(p * 100), 0),
      10000,
    );
    assert.ok(points.every((p) => Number.isInteger(p) && p > 0));
  }
});
