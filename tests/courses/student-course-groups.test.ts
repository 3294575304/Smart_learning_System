import assert from "node:assert/strict";
import test from "node:test";
import { groupStudentCourseContexts } from "@/services/courses/student-course-groups";
test("同一课程的多个教学班归为一个课程，班级身份保留", () => {
  const rows = [
    {
      course: { id: "c", name: "Python" },
      classroom: { id: "a", name: "正式班" },
    },
    {
      course: { id: "c", name: "Python" },
      classroom: { id: "b", name: "测试班" },
    },
  ];
  const groups = groupStudentCourseContexts([...rows, rows[0]]);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].classrooms.map((item) => item.id),
    ["a", "b"],
  );
});
test("同名课程仍按课程身份区分，空课程安全返回", () => {
  const groups = groupStudentCourseContexts([
    { course: { id: "c1", name: "Python" }, classroom: { id: "a" } },
    { course: { id: "c2", name: "Python" }, classroom: { id: "b" } },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groupStudentCourseContexts([]), []);
});
