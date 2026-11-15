import assert from "node:assert/strict";
import test from "node:test";
import {
  activityHref,
  assignmentTaskReturn,
  withAssignmentTaskReturn,
} from "@/services/student-experience/activity-query";

const scope = {
  courseId: "c123456789012345678901234",
  classroomId: "c223456789012345678901234",
};

test("学习任务的作业入口保留原列表筛选，区分作业归属与列表归属", () => {
  const returnTo = activityHref("tasks", {
    classroomId: scope.classroomId,
    kind: "assignment",
    status: "TODO",
    page: 2,
  });
  const href = withAssignmentTaskReturn(
    "/student/submissions/draft/answer?classroomId=" + scope.classroomId,
    returnTo,
  );
  const url = new URL(href, "http://localhost");
  assert.equal(url.searchParams.get("classroomId"), scope.classroomId);
  assert.equal(
    assignmentTaskReturn(url.searchParams.get("returnTo"), scope),
    returnTo,
  );
  assert.equal(assignmentTaskReturn("/student/tasks", scope), "/student/tasks");
});

test("作业返回忽略外部目标、越界筛选和不合法的任务地址", () => {
  for (const value of [
    undefined,
    "//localhost/student/tasks",
    "https://other.invalid/student/tasks",
    "/student/tasks/detail",
    "/student/assignments",
    "/student/tasks?status=SUBMITTED",
    "/student/tasks?page=2&page=3",
    "/student/tasks?classroomId=c323456789012345678901234",
  ]) {
    assert.equal(assignmentTaskReturn(value, scope), undefined);
  }
});
