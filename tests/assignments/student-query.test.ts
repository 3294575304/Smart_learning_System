import assert from "node:assert/strict";
import test from "node:test";
import {
  safeStudentReturn,
  studentListHref,
  teacherStudentQuerySchema,
  teacherStudentDetailQuerySchema,
} from "@/services/assignments/student-query";
test("学生查询保留学号文本、分页和独立状态，不受作业状态干扰", () => {
  const query = teacherStudentQuerySchema.parse({
    studentKeyword: " 00123 ",
    page: "2",
    status: "ARCHIVED",
  });
  assert.equal(query.studentKeyword, "00123");
  assert.equal(query.section, "CURRENT");
  assert.equal(query.pageSize, 20);
  assert.match(studentListHref(query), /studentKeyword=00123/);
  assert.equal(
    teacherStudentQuerySchema.safeParse({ pageSize: 51 }).success,
    false,
  );
  assert.equal(teacherStudentDetailQuerySchema.safeParse({}).success, false);
});
test("返回地址只接受学生查询站内路径并规范化参数", () => {
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/teacher/assignments/students/x",
    "/teacher/assignments?courseId=invalid",
  ]) {
    assert.equal(
      safeStudentReturn(value),
      "/teacher/assignments?view=STUDENTS",
    );
  }
  const result = safeStudentReturn(
    "/teacher/assignments?view=STUDENTS&studentKeyword=001&page=2&section=HISTORY&redirect=https://evil.example",
  );
  assert.ok(result.includes("page=2"));
  assert.ok(result.includes("section=HISTORY"));
  assert.ok(!result.includes("evil"));
});
