import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentParticipation,
  isReportableAssignment,
  latestEffectiveSubmissions,
  reportingClassroomMatches,
  type EffectiveSubmission,
} from "@/services/assignments/reporting";

const now = new Date("2026-10-24T08:00:00Z");

test("统计仅接受已实际开放作业，归档不等于实际发布", () => {
  for (const status of ["PUBLISHED", "CLOSED", "ARCHIVED"]) {
    assert.equal(
      isReportableAssignment({ status, publishedAt: now }, now),
      true,
    );
    assert.equal(
      isReportableAssignment(
        { status, publishedAt: new Date(now.getTime() + 1) },
        now,
      ),
      false,
    );
    assert.equal(
      isReportableAssignment({ status, publishedAt: null }, now),
      false,
    );
  }
  assert.equal(
    isReportableAssignment({ status: "DRAFT", publishedAt: now }, now),
    false,
  );
});

test("当前历史班级范围分别包含授课班级及有历史作业的授课班级", () => {
  for (const status of ["ACTIVE", "COMPLETED", "CLOSED", "ARCHIVED"]) {
    const classroom = { status, historicalAssignmentCount: 0 };
    assert.equal(reportingClassroomMatches(classroom, "ALL"), true);
    assert.equal(
      reportingClassroomMatches(classroom, "CURRENT"),
      status === "ACTIVE",
    );
    assert.equal(
      reportingClassroomMatches(classroom, "HISTORY"),
      status !== "ACTIVE",
    );
  }
  assert.equal(
    reportingClassroomMatches(
      { status: "ACTIVE", historicalAssignmentCount: 1 },
      "HISTORY",
    ),
    true,
  );
});

test("最新有效提交忽略后续草稿和撤回，按班级学生分别计数", () => {
  const make = (
    id: string,
    status: EffectiveSubmission["status"],
    attemptNumber: number,
    studentId = "s1",
  ): EffectiveSubmission => ({
    id,
    status,
    attemptNumber,
    studentId,
    assignmentId: "a1",
    submittedAt: now,
  });
  const latest = latestEffectiveSubmissions([
    make("valid", "GRADED", 1),
    make("draft", "IN_PROGRESS", 3),
    make("withdrawn", "WITHDRAWN", 4),
    make("historical", "PUBLISHED", 1, "removed-student"),
    make("pending", "PENDING_REVIEW", 2, "s2"),
  ]).get("a1");
  assert.ok(latest);
  assert.equal(latest.get("s1")?.id, "valid");
  const result = assignmentParticipation(
    new Set(["s1", "s2", "late-joiner"]),
    latest,
    now,
    now,
  );
  assert.equal(result.submissions.length, 2);
  assert.equal(result.unsubmittedCount, 1);
  assert.equal(result.overdueCount, 1);
  assert.equal(result.pendingReviewCount, 1);
  assert.equal(result.historicalSubmittedCount, 1);
  assert.equal(
    assignmentParticipation(
      new Set(["s1", "s2", "late-joiner"]),
      latest,
      new Date(now.getTime() + 1),
      now,
    ).overdueCount,
    0,
  );
});

test("重复输入按提交时间及稳定ID决出同次有效提交，空班级不产生缺交", () => {
  const base: EffectiveSubmission = {
    id: "a",
    status: "GRADED",
    attemptNumber: 1,
    studentId: "s1",
    assignmentId: "a1",
    submittedAt: now,
  };
  const values = [
    base,
    { ...base, id: "z" },
    { ...base, id: "future", submittedAt: new Date(now.getTime() + 1) },
  ];
  assert.equal(
    latestEffectiveSubmissions(values).get("a1")?.get("s1")?.id,
    "future",
  );
  assert.equal(
    assignmentParticipation(new Set(), new Map(), null, now).unsubmittedCount,
    0,
  );
});
