import assert from "node:assert/strict";
import test from "node:test";
import { classroomFilterHref } from "../../components/dashboard/student-classroom-filter";

test("切换教学班保留课程、视图和状态，并重置分页", () => {
  const href = classroomFilterHref(
    "/student/assignments",
    "courseId=course-a&classroomId=old&page=8&view=records&status=SUBMITTED",
    "class-b",
  );
  const url = new URL(href, "https://test.local");
  assert.equal(url.pathname, "/student/assignments");
  assert.equal(url.searchParams.get("courseId"), "course-a");
  assert.equal(url.searchParams.get("view"), "records");
  assert.equal(url.searchParams.get("status"), "SUBMITTED");
  assert.equal(url.searchParams.get("classroomId"), "class-b");
  assert.equal(url.searchParams.has("page"), false);
});

test("查看整体只移除班级限制，不丢失课程范围", () => {
  assert.equal(
    classroomFilterHref(
      "/student/surveys",
      "classroomId=one&page=2&courseId=course-a",
      "",
    ),
    "/student/surveys?courseId=course-a",
  );
  assert.equal(
    classroomFilterHref("/student/attendance", "classroomId=one", ""),
    "/student/attendance",
  );
});
