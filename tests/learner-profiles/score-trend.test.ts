import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScoreTrend,
  type ScoredSession,
} from "../../services/learner-profiles/score-trend";

const session = (
  id: string,
  score: number | null,
  maxScore: number | null,
  time = 1,
): ScoredSession => ({
  id,
  score,
  maxScore,
  title: "流程验收",
  source: "正式作业",
  occurredAt: new Date(time),
});

test("整次评分保留发布精度，不把99.76画成100或0分当作缺失", () => {
  const points = buildScoreTrend([
    { ...session("a", 4, 13), percentage: 30.77 },
    { ...session("b", 99.76, 100, 2), percentage: 99.76 },
    session("c", 0, 13, 3),
  ]);
  assert.deepEqual(
    points.map((p) => p.value),
    [30.77, 99.76, 0],
  );
});

test("无成绩、未判完及无分母不补零；同一整组不重复计数", () => {
  const a = session("a", 7, 13);
  assert.deepEqual(
    buildScoreTrend([
      a,
      a,
      session("b", null, 13),
      session("c", 0, 0),
      session("d", 14, 13),
      session("e", NaN, 13),
    ]).map((p) => p.value),
    [53.84],
  );
});

test("先按实际作答时间排序再取最近8组，来源可追溯且不改变原数组", () => {
  const input = Array.from({ length: 12 }, (_, i) =>
    session(String(i), i, 13, 12 - i),
  );
  const before = [...input];
  const points = buildScoreTrend(input);
  assert.deepEqual(
    points.map((p) => p.id),
    ["7", "6", "5", "4", "3", "2", "1", "0"],
  );
  assert.match(points[0].detail, /正式作业.*流程验收.*7\/13/);
  assert.deepEqual(input, before);
});
