import assert from "node:assert/strict";
import test from "node:test";

import { filterActivitySince } from "@/services/learner-profiles/learning-center-format";

/**
 * 时间线区间过滤。
 *
 * 这条逻辑原来内联在页面组件里，图表过滤了、时间线漏了，用户切到「近 30 天」
 * 只会看到图变了、记录一条没少，像是筛选失效。抽成纯函数后在这里锁住行为：
 * 全部区间原样返回、边界相等保留、更早的剔除。
 */
const items = [
  { id: "a", occurredAt: new Date("2026-09-01T10:00:00+08:00") },
  { id: "b", occurredAt: new Date("2026-11-01T10:00:00+08:00") },
  { id: "c", occurredAt: new Date("2026-11-25T10:00:00+08:00") },
];

test("区间为 null（全部）时原样返回，且不共享原数组引用", () => {
  const result = filterActivitySince(items, null);
  assert.deepEqual(
    result.map((item) => item.id),
    ["a", "b", "c"],
  );
  assert.notEqual(result, items);
  assert.equal(items.length, 3);
});

test("边界时刻相等要保留，早于区间起点的剔除", () => {
  const since = new Date("2026-11-01T10:00:00+08:00");
  const result = filterActivitySince(items, since);
  assert.deepEqual(
    result.map((item) => item.id),
    ["b", "c"],
  );
});

test("区间内没有记录时返回空数组，不返回 undefined", () => {
  const result = filterActivitySince(
    items,
    new Date("2026-12-01T00:00:00+08:00"),
  );
  assert.deepEqual(result, []);
  assert.deepEqual(filterActivitySince([], null), []);
});
