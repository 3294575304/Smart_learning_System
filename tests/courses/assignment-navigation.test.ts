import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardPageTitle } from "@/components/dashboard/navigation";
test("作业查询、个人明细、整班统计的标题互不混淆", () => {
  assert.equal(
    getDashboardPageTitle("/teacher/assignments", [], { view: "STUDENTS" }),
    "学生作业查询",
  );
  assert.equal(
    getDashboardPageTitle("/teacher/assignments/students/student-a", []),
    "学生作业明细",
  );
  assert.equal(
    getDashboardPageTitle("/teacher/assignments/task-a/results", [], {
      studentId: "student-a",
    }),
    "个人作答",
  );
  assert.equal(
    getDashboardPageTitle("/teacher/assignments/task-a/results", []),
    "成绩统计",
  );
});
