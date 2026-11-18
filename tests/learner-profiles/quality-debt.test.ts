import assert from "node:assert/strict";
import test from "node:test";

import { isoWeekKey } from "../../services/learner-profiles/weekly-plan-key";
import {
  SNAPSHOT_KEEP_RECENT,
  selectSnapshotIdsToPrune,
  type SnapshotRetentionRow,
} from "../../services/learner-profiles/snapshot-retention-policy";
import { DIMENSION_REGISTRY } from "../../services/learner-profiles/dimension-registry";

const now = new Date("2026-11-18T12:00:00.000Z");

function daysAgo(days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

test("isoWeekKey 以周一为一周起点，跨月也正确", () => {
  // 2026-11-18 是周三
  assert.equal(isoWeekKey(new Date("2026-11-18T10:00:00")), "2026-11-16");
  // 同一周的周日仍归到同一周一
  assert.equal(isoWeekKey(new Date("2026-11-22T23:00:00")), "2026-11-16");
  // 周日本身属于上一周（11-01 是周日，所在周从 10-26 开始）
  assert.equal(isoWeekKey(new Date("2026-11-01T08:00:00")), "2026-10-26");
});

test("快照保留：少于上限时一条都不删", () => {
  const rows: SnapshotRetentionRow[] = Array.from(
    { length: 5 },
    (_, index) => ({
      id: `s${index}`,
      revisionNumber: index + 1,
      createdAt: daysAgo(120 - index),
    }),
  );
  assert.deepEqual(selectSnapshotIdsToPrune(rows, new Set(), { now }), []);
});

test("快照保留：近 30 天内的版本即使超出数量上限也保留", () => {
  const rows: SnapshotRetentionRow[] = Array.from(
    { length: SNAPSHOT_KEEP_RECENT + 6 },
    (_, index) => ({
      id: `s${index}`,
      revisionNumber: index + 1,
      createdAt: daysAgo(index),
    }),
  );
  assert.deepEqual(selectSnapshotIdsToPrune(rows, new Set(), { now }), []);
});

test("快照保留：只删又老又没被引用的版本", () => {
  const rows: SnapshotRetentionRow[] = Array.from(
    { length: 25 },
    (_, index) => ({
      id: `s${index}`,
      revisionNumber: index + 1,
      createdAt: daysAgo(60 - index),
    }),
  );
  // 输入按修订号乱序，验证内部会自己排序
  const shuffled = [...rows].reverse();
  const pruned = selectSnapshotIdsToPrune(shuffled, new Set(["s3"]), {
    keepRecent: 20,
    keepDays: 30,
    now,
  });
  // 修订 21-25 是最近 20 条之外的；其中 createdAt 距今 39-35 天，都超 30 天
  assert.deepEqual([...pruned].sort(), ["s0", "s1", "s2", "s4"]);
  assert.ok(!pruned.includes("s3"), "被推荐周期引用的快照不能删");
});

test("维度注册表：五个维度齐备，反思是主观维度且带跳转", () => {
  assert.deepEqual(
    DIMENSION_REGISTRY.map((item) => item.key),
    ["attendance", "objectiveMastery", "activity", "reflection", "programming"],
  );
  const reflection = DIMENSION_REGISTRY.find(
    (item) => item.key === "reflection",
  )!;
  const card = reflection.build({}, true);
  assert.equal(card.tone, "subjective");
  assert.equal(card.action, "reflection");
  assert.equal(card.actionLabel, "写一条学习自述");
  assert.equal(card.headline, "0 条");
  assert.equal(
    reflection.build({ confirmedCount: 2 }, false).actionLabel,
    "查看或修改自述",
  );
});

test("维度注册表：维度 JSON 缺失或脏数据不会崩，统一降级为 —", () => {
  const attendance = DIMENSION_REGISTRY.find(
    (item) => item.key === "attendance",
  )!;
  assert.equal(attendance.build(null, false).headline, "—");
  assert.equal(
    attendance.build({ rate: Number.NaN, evidenceCount: "x" }, false).headline,
    "—",
  );
  assert.equal(
    attendance.build({ rate: 92, evidenceCount: 8 }, false).headline,
    "92%",
  );
  assert.equal(attendance.build({ rate: 92 }, true).label, "我的出勤");
});
