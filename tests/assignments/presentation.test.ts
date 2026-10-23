import test from "node:test";
import assert from "node:assert/strict";
import {
  assignmentDisplayStatus,
  assignmentStatusWhere,
  hundredPointScore,
  assignmentStatusOptions,
} from "@/services/assignments/presentation";
import { assignmentListQuerySchema } from "@/services/assignments/schemas";

test("日常筛选精简，历史状态按实际数据显示并保留已选旧链接", () => {
  const daily = ["DRAFT", "UPCOMING", "IN_PROGRESS", "EXPIRED"];
  assert.deepEqual(assignmentStatusOptions([]), daily);
  assert.deepEqual(assignmentStatusOptions(["CLOSED"]), [...daily, "CLOSED"]);
  assert.deepEqual(assignmentStatusOptions(["ARCHIVED"]), [
    ...daily,
    "ARCHIVED",
  ]);
  assert.deepEqual(assignmentStatusOptions(["CLOSED", "ARCHIVED"]), [
    ...daily,
    "CLOSED",
    "ARCHIVED",
  ]);
  assert.deepEqual(assignmentStatusOptions([], "ARCHIVED"), [
    ...daily,
    "ARCHIVED",
  ]);
  assert.deepEqual(assignmentStatusOptions([], "PUBLISHED"), [
    ...daily,
    "PUBLISHED",
  ]);
  assert.deepEqual(assignmentStatusWhere("ARCHIVED"), { status: "ARCHIVED" });
});

test("百分制换算保留原始语义，零分有效且未知或无效满分不伪造零分", () => {
  assert.equal(hundredPointScore(37, 60), 61.67);
  assert.equal(hundredPointScore(12, 13), 92.31);
  assert.equal(hundredPointScore(0, 13), 0);
  assert.equal(hundredPointScore(100, 100), 100);
  for (const [score, max] of [
    [null, 100],
    [10, null],
    [10, 0],
    [NaN, 100],
    [1, Infinity],
  ] as const)
    assert.equal(hundredPointScore(score, max), null);
});
test("作业状态按发布时间和截止时间分类，时间边界与筛选一致", () => {
  const now = new Date("2026-10-18T00:00:00Z");
  const earlier = new Date(now.getTime() - 1),
    later = new Date(now.getTime() + 1);
  const base = {
    status: "PUBLISHED" as const,
    publishedAt: earlier,
    dueAt: later,
  };
  assert.equal(assignmentDisplayStatus(base, now), "IN_PROGRESS");
  assert.equal(
    assignmentDisplayStatus({ ...base, publishedAt: later }, now),
    "UPCOMING",
  );
  assert.equal(
    assignmentDisplayStatus({ ...base, publishedAt: now }, now),
    "IN_PROGRESS",
  );
  assert.equal(
    assignmentDisplayStatus({ ...base, dueAt: now }, now),
    "EXPIRED",
  );
  assert.equal(
    assignmentDisplayStatus({ ...base, publishedAt: null, dueAt: null }, now),
    "IN_PROGRESS",
  );
  assert.equal(
    assignmentDisplayStatus({ ...base, status: "CLOSED" }, now),
    "CLOSED",
  );
  assert.equal(
    assignmentDisplayStatus({ ...base, status: "DRAFT" }, now),
    "DRAFT",
  );
  assert.deepEqual(assignmentStatusWhere("UPCOMING", now), {
    status: "PUBLISHED",
    publishedAt: { gt: now },
  });
  assert.deepEqual(assignmentStatusWhere("PUBLISHED", now), {
    status: "PUBLISHED",
  });
  assert.deepEqual(assignmentStatusWhere(undefined, now), {
    status: { not: "ARCHIVED" },
  });
  for (const status of [
    "IN_PROGRESS",
    "UPCOMING",
    "EXPIRED",
    "PUBLISHED",
    "ARCHIVED",
  ])
    assert.ok(assignmentListQuerySchema.safeParse({ status }).success);
  assert.equal(
    assignmentListQuerySchema.safeParse({ status: "invented" }).success,
    false,
  );
});
