import assert from "node:assert/strict";
import test from "node:test";
import { examListReturn } from "../../services/student-experience/activity-query";

const scope = {
  courseId: "c000000000000000000000001",
  classroomId: "c000000000000000000000002",
  focus: "c000000000000000000000003",
};

test("考试详情返回原筛选和页码，并定位当前考试", () => {
  assert.equal(
    examListReturn("/student/exams?status=SUBMITTED&page=2#old", scope),
    `/student/exams?status=SUBMITTED&focus=${scope.focus}&page=2#exam-${scope.focus}`,
  );
});

test("考试返回拒绝外部地址、跨班范围和非法筛选", () => {
  const fallback = examListReturn(undefined, scope);
  for (const value of [
    "//example.com/student/exams",
    "/student/assignments",
    "/student/exams?classroomId=c000000000000000000000004",
    "/student/exams?status=INVALID",
  ]) {
    assert.equal(examListReturn(value, scope), fallback);
  }
});
