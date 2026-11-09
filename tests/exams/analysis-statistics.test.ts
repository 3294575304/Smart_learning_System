import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kr20,
  percent,
  scoreStats,
} from "@/services/exams/analysis-statistics";

test("exam score metrics distinguish no scores from zero scores", () => {
  assert.equal(percent(0, 0), null);
  const empty = scoreStats([], { pass: 60, excellent: 85 });
  assert.equal(empty.average, null);
  assert.deepEqual(empty.bands, [0, 0, 0, 0, 0]);
  const result = scoreStats([0, 60, 85, 100], { pass: 60, excellent: 85 });
  assert.equal(result.average, 61.3);
  assert.equal(result.median, 72.5);
  assert.equal(result.passRate, 75);
  assert.equal(result.excellentRate, 50);
  assert.deepEqual(result.bands, [1, 1, 0, 1, 1]);
});

test("KR-20 requires complete binary data and enough objective items", () => {
  assert.equal(
    kr20([
      [1, 0],
      [0, 1],
    ]),
    null,
  );
  assert.equal(
    kr20([
      [1, 0, 1, 0, 1, 0, 1, 0, 1, -1],
      [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    ]),
    null,
  );
  assert.equal(
    typeof kr20([[...Array(10).fill(1)], [...Array(10).fill(0)]]),
    "number",
  );
});
