import test from "node:test";
import assert from "node:assert/strict";
import {
  selectStudentEnrollment,
  studentEnrollmentLabel,
} from "../../services/courses/student-enrollment";
const items = [
  {
    course: { id: "c", name: "Python", term: "秋季", status: "ACTIVE" },
    classroom: { id: "old", name: "旧班", status: "ARCHIVED" },
  },
  {
    course: { id: "c", name: "Python", term: "秋季", status: "ACTIVE" },
    classroom: { id: "one", name: "一班", status: "ACTIVE" },
  },
  {
    course: { id: "c", name: "Python", term: "秋季", status: "ACTIVE" },
    classroom: { id: "two", name: "二班", status: "ACTIVE" },
  },
  {
    course: { id: "d", name: "另一课程", term: "春季", status: "ACTIVE" },
    classroom: { id: "three", name: "三班", status: "ACTIVE" },
  },
];
test("学生课程按加入班级独立，默认当前课程且不合并同名课", () => {
  assert.equal(selectStudentEnrollment(items, {})?.classroom.id, "one");
  assert.equal(
    selectStudentEnrollment(items, { courseId: "c", classroomId: "two" })
      ?.classroom.id,
    "two",
  );
  assert.equal(
    selectStudentEnrollment(items, { classroomId: "old" })?.classroom.id,
    "old",
  );
  assert.notEqual(
    studentEnrollmentLabel(items[1]),
    studentEnrollmentLabel(items[2]),
  );
  assert.equal(selectStudentEnrollment([], {}), undefined);
});
test("课程切换拒绝越权、跨课程、重复和非法参数", () => {
  for (const query of [
    { courseId: "foreign" },
    { classroomId: "foreign" },
    { courseId: "d", classroomId: "two" },
    { classroomId: ["one", "two"] },
    { classroomId: "" },
  ])
    assert.throws(() => selectStudentEnrollment(items, query));
});
