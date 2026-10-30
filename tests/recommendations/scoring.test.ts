import assert from "node:assert/strict";
import test from "node:test";
import {
  practicePointAllocation,
  studentScoreLabel,
  summarizePracticeScores,
} from "../../services/recommendations/scoring";

for (const count of [1, 3, 20, 50])
  test(`${count} actual questions have exactly 100 points`, () => {
    const points = practicePointAllocation(count);
    assert.equal(
      points.reduce((sum, value) => sum + Math.round(value * 100), 0),
      10000,
    );
    assert.equal(points.length, count);
    assert.ok(Math.max(...points) - Math.min(...points) < 0.011);
  });
test("remainder is stable and actual shortage uses actual count", () => {
  assert.deepEqual(practicePointAllocation(3), [33.34, 33.33, 33.33]);
  assert.deepEqual(practicePointAllocation(0), []);
  assert.deepEqual(practicePointAllocation(1), [100]);
});
test("student percentages preserve zero and reject incomplete denominators", () => {
  assert.equal(studentScoreLabel(18, 20), "90 分｜原始得分 18／20");
  assert.equal(studentScoreLabel(45, 50), "90 分｜原始得分 45／50");
  assert.equal(studentScoreLabel(0, 20), "0 分｜原始得分 0／20");
  for (const [score, max] of [
    [null, 20],
    [2, null],
    [0, 0],
    [Number.NaN, 20],
  ])
    assert.equal(studentScoreLabel(score, max), "缺少完整成绩");
});
test("pending, failed and unanswered questions are distinct from graded zero", () => {
  const summary = summarizePracticeScores([
    { status: "COMPLETED", assignedPoints: 25, score: 0, maxScore: 25 },
    { status: "STARTED", assignedPoints: 25, judgingStatus: "PENDING" },
    { status: "STARTED", assignedPoints: 25, judgingStatus: "SYSTEM_ERROR" },
    { status: "PENDING", assignedPoints: 25 },
  ]);
  assert.equal(summary.gradedScore, 0);
  assert.equal(summary.percentage, null);
  assert.equal(summary.gradedCount, 1);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.errorCount, 1);
  assert.equal(summary.unansweredCount, 1);
  assert.equal(summary.totalPoints, 100);
  assert.equal(summary.complete, false);
});
test("legacy complete results convert without changing raw values", () => {
  const items = [
    { status: "COMPLETED", score: 1, maxScore: 1 },
    { status: "COMPLETED", score: 4, maxScore: 5 },
  ];
  const summary = summarizePracticeScores(items);
  assert.equal(summary.percentage, 83.33);
  assert.equal(summary.frozen, false);
  assert.equal(summary.gradedScore, 5);
  assert.equal(items[1].maxScore, 5);
  assert.equal(
    summarizePracticeScores([{ status: "COMPLETED", score: 1 }]).percentage,
    null,
  );
});
