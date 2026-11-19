import assert from "node:assert/strict";
import test from "node:test";
import {
  searchStudentEnrollments,
  selectMostActiveStudentEnrollment,
} from "@/services/courses/student-enrollment";

const enrollments = [
  {
    course: {
      id: "1",
      name: "数据处理 Python",
      term: "2026 秋",
      courseNo: "CS101",
      status: "ACTIVE",
    },
    classroom: { id: "a", name: "一班", status: "ACTIVE" },
    lastClassActivityAt: 30,
    lastPracticeAt: 0,
  },
  {
    course: {
      id: "2",
      name: "Python 程序设计",
      term: "2026 秋",
      courseNo: "CS201",
      status: "ACTIVE",
    },
    classroom: { id: "b", name: "一班", status: "ACTIVE" },
    lastClassActivityAt: 45,
    lastPracticeAt: 60,
  },
  {
    course: {
      id: "3",
      name: "课程项目",
      term: "2025 春",
      courseNo: "CS301",
      status: "ARCHIVED",
    },
    classroom: { id: "c", name: "二班", status: "ARCHIVED" },
    lastClassActivityAt: 80,
    lastPracticeAt: 0,
  },
  {
    course: {
      id: "2",
      name: "Python 程序设计",
      term: "2026 秋",
      courseNo: "CS201",
      status: "ACTIVE",
    },
    classroom: { id: "d", name: "二班", status: "ACTIVE" },
    lastClassActivityAt: 35,
    lastPracticeAt: 60,
  },
];

test("课程搜索组合包含、前缀与教学班条件", () => {
  assert.deepEqual(
    searchStudentEnrollments(enrollments, "ＰＹＴ 一班").map(
      ({ classroom }) => classroom.id,
    ),
    ["b", "a"],
  );
  assert.deepEqual(
    searchStudentEnrollments(enrollments, "cs201，二班").map(
      ({ classroom }) => classroom.id,
    ),
    ["d"],
  );
  assert.equal(searchStudentEnrollments(enrollments, "不存在").length, 0);
});

test("默认优先学习中的班级，并按本人最近记录选择", () => {
  assert.equal(
    selectMostActiveStudentEnrollment(enrollments)?.classroom.id,
    "b",
  );
  assert.equal(
    selectMostActiveStudentEnrollment([enrollments[2]])?.classroom.id,
    "c",
  );
  assert.equal(selectMostActiveStudentEnrollment([]), undefined);
});
