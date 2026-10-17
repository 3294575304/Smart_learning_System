import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeDashboardAssignmentTodo,
  summarizeDashboardMastery,
} from "@/services/dashboard/teacher-dashboard-metrics";
import { teacherDashboardQuerySchema } from "@/services/dashboard/teacher-dashboard-schemas";
import { filterDashboardClassroomItems } from "@/services/dashboard/teacher-dashboard-view";

test("card filters are independent and retain course-wide tasks only when requested", () => {
  const items = [
    { key: "a", classroomId: "class-a" },
    { key: "b", classroomId: "class-b" },
    { key: "shared", classroomId: null },
  ];
  assert.deepEqual(
    filterDashboardClassroomItems(items, "class-a", true).map(
      (item) => item.key,
    ),
    ["a", "shared"],
  );
  assert.deepEqual(
    filterDashboardClassroomItems(items, "class-b").map((item) => item.key),
    ["b"],
  );
  assert.equal(filterDashboardClassroomItems(items, "").length, 3);
  assert.equal(items.length, 3);
  assert.deepEqual(filterDashboardClassroomItems(items, "missing"), []);
});

const graded = {
  status: "GRADED",
  score: 80,
  maxScore: 100,
  gradedAt: new Date(),
  manualAnswerCount: 0,
};

test("dashboard removes completed publications and ignores drafts or unfinished machine grading", () => {
  assert.deepEqual(
    summarizeDashboardAssignmentTodo([
      { ...graded, status: "PUBLISHED" },
      { ...graded, status: "IN_PROGRESS" },
    ]),
    { pendingReviewCount: 0, publishableCount: 0 },
  );
  assert.deepEqual(summarizeDashboardAssignmentTodo([graded]), {
    pendingReviewCount: 0,
    publishableCount: 1,
  });
  assert.deepEqual(
    summarizeDashboardAssignmentTodo([
      graded,
      { ...graded, status: "SUBMITTED" },
    ]),
    { pendingReviewCount: 0, publishableCount: 0 },
  );
});

test("dashboard does not offer publishing while manual review or invalid grading blocks it", () => {
  assert.deepEqual(
    summarizeDashboardAssignmentTodo([
      graded,
      { ...graded, status: "PENDING_REVIEW", manualAnswerCount: 2 },
    ]),
    { pendingReviewCount: 1, publishableCount: 0 },
  );
  assert.equal(
    summarizeDashboardAssignmentTodo([{ ...graded, score: null }])
      .publishableCount,
    0,
  );
  assert.equal(
    summarizeDashboardAssignmentTodo([{ ...graded, gradedAt: null }])
      .publishableCount,
    0,
  );
});

test("mastery excludes foreign members and concepts and does not turn missing evidence into zero", () => {
  const entries = [
    {
      studentId: "s1",
      conceptId: "c1",
      score: 90,
      evidenceCount: 3,
      lastEvidenceAt: new Date("2026-10-01"),
    },
    {
      studentId: "s2",
      conceptId: "c1",
      score: 0,
      evidenceCount: 1,
      lastEvidenceAt: new Date("2026-10-02"),
    },
    {
      studentId: "outsider",
      conceptId: "c1",
      score: 0,
      evidenceCount: 3,
      lastEvidenceAt: new Date(),
    },
    {
      studentId: "s1",
      conceptId: "old-concept",
      score: 0,
      evidenceCount: 3,
      lastEvidenceAt: new Date(),
    },
  ];
  const result = summarizeDashboardMastery(
    ["s1", "s2", "s3", "s1"],
    ["c1", "c2"],
    entries,
  );
  assert.equal(result.score, 90);
  assert.equal(result.stableCount, 1);
  assert.equal(result.evidenceCount, 2);
  assert.equal(result.totalCount, 6);
  assert.equal(result.updatedAt?.toISOString(), "2026-10-02T00:00:00.000Z");
});

test("empty mastery and insufficient evidence remain unassessed while genuine zero remains zero", () => {
  assert.equal(summarizeDashboardMastery(["s"], ["c"], []).score, null);
  const entry = {
    studentId: "s",
    conceptId: "c",
    score: 0,
    evidenceCount: 2,
    lastEvidenceAt: new Date(),
  };
  assert.equal(summarizeDashboardMastery(["s"], ["c"], [entry]).score, null);
  assert.equal(
    summarizeDashboardMastery(["s"], ["c"], [{ ...entry, evidenceCount: 3 }])
      .score,
    0,
  );
});

test("dashboard filters reject malformed and repeated identifiers instead of widening scope", () => {
  assert.equal(
    teacherDashboardQuerySchema.safeParse({ courseId: "bad" }).success,
    false,
  );
  assert.equal(
    teacherDashboardQuerySchema.safeParse({ courseId: ["a", "b"] }).success,
    false,
  );
  assert.deepEqual(
    teacherDashboardQuerySchema.parse({ courseId: "", classroomId: "" }),
    { courseId: undefined, classroomId: undefined },
  );
});
