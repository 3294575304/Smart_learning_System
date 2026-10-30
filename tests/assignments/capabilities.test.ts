import assert from "node:assert/strict";
import test from "node:test";
import { assignmentCapabilities } from "@/services/assignments/capabilities";
import { summarizeDashboardAssignmentTodo } from "@/services/dashboard/teacher-dashboard-metrics";
const now = new Date("2026-10-27T08:00:00Z");
const base = {
  status: "PUBLISHED",
  publishedAt: new Date(now.getTime() - 1000),
  dueAt: now,
  classroom: { status: "ACTIVE" },
};
test("截止时刻才可公布，缺失时间和预约未开放不产生可公布状态", () => {
  assert.equal(assignmentCapabilities(base, now).canPublishResults, true);
  for (const value of [
    { ...base, dueAt: new Date(now.getTime() + 1) },
    { ...base, dueAt: null },
    { ...base, publishedAt: null },
    { ...base, publishedAt: new Date(now.getTime() + 1) },
  ]) {
    assert.equal(assignmentCapabilities(value, now).canPublishResults, false);
    assert.ok(assignmentCapabilities(value, now).publicationBlockedReason);
  }
});
test("结课和关闭仍可补批公布，归档和草稿只读边界保持明确", () => {
  for (const status of ["COMPLETED", "CLOSED"]) {
    const state = assignmentCapabilities(
      { ...base, dueAt: new Date(now.getTime() + 1000), classroom: { status } },
      now,
    );
    assert.equal(state.canGrade, true);
    assert.equal(state.canPublishResults, true);
  }
  assert.equal(
    assignmentCapabilities({ ...base, status: "CLOSED" }, now)
      .canPublishResults,
    true,
  );
  for (const value of [
    { ...base, status: "ARCHIVED" },
    { ...base, classroom: { status: "ARCHIVED" } },
  ]) {
    assert.equal(assignmentCapabilities(value, now).canGrade, false);
    assert.equal(assignmentCapabilities(value, now).canPublishResults, false);
    assert.equal(assignmentCapabilities(value, now).readOnly, true);
  }
  assert.equal(
    assignmentCapabilities({ ...base, status: "DRAFT" }, now).canEditDraft,
    true,
  );
  assert.equal(
    assignmentCapabilities(
      { ...base, status: "DRAFT", classroom: { status: "COMPLETED" } },
      now,
    ).canEditDraft,
    false,
  );
});
test("工作台与公布按钮共用截止和归档条件，不把将来可做的操作列为待办", () => {
  const graded = {
    status: "GRADED",
    score: 80,
    maxScore: 100,
    gradedAt: now,
    manualAnswerCount: 0,
  };
  assert.equal(
    summarizeDashboardAssignmentTodo([graded], base, now).publishableCount,
    1,
  );
  assert.equal(
    summarizeDashboardAssignmentTodo(
      [graded],
      { ...base, dueAt: new Date(now.getTime() + 1) },
      now,
    ).publishableCount,
    0,
  );
  assert.equal(
    summarizeDashboardAssignmentTodo(
      [graded],
      { ...base, status: "ARCHIVED" },
      now,
    ).publishableCount,
    0,
  );
  assert.equal(
    summarizeDashboardAssignmentTodo(
      [{ ...graded, status: "PENDING_REVIEW", manualAnswerCount: 1 }],
      base,
      now,
    ).pendingReviewCount,
    1,
  );
});
