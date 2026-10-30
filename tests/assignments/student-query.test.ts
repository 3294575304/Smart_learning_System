import assert from "node:assert/strict";
import test from "node:test";
import {
  safeStudentReturn,
  safeStudentWorkReturn,
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
  assert.equal(query.section, "ALL");
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
  assert.ok(result.includes("section=ALL"));
  assert.ok(!result.includes("evil"));
});

test("旧学生列表范围和提交条件归一化，明细保留历史范围与待批改下钻", () => {
  const classroomId = "cm12345678901234567890123";
  const courseId = "cm12345678901234567890124";
  const old = teacherStudentQuerySchema.parse({
    section: "HISTORY",
    submissionFilter: "OVERDUE",
    classroomId,
    courseId,
    studentKeyword: "0001",
    page: 3,
  });
  const url = new URL(studentListHref(old), "http://localhost");
  assert.equal(url.searchParams.get("section"), "ALL");
  assert.equal(url.searchParams.has("submissionFilter"), false);
  assert.equal(url.searchParams.get("classroomId"), classroomId);
  assert.equal(url.searchParams.get("courseId"), courseId);
  assert.equal(url.searchParams.get("studentKeyword"), "0001");
  assert.equal(url.searchParams.get("page"), "3");
  const detail = teacherStudentDetailQuerySchema.parse({
    ...old,
    submissionFilter: "PENDING_REVIEW",
  });
  assert.equal(detail.section, "HISTORY");
  assert.equal(detail.submissionFilter, "PENDING_REVIEW");
  assert.equal(
    teacherStudentDetailQuerySchema.parse({ classroomId }).section,
    "ALL",
  );
  assert.equal(
    teacherStudentQuerySchema.safeParse({ section: "INVALID" }).success,
    false,
  );
  assert.equal(
    teacherStudentQuerySchema.safeParse({ submissionFilter: "INVALID" })
      .success,
    false,
  );
});

test("个人作答返回地址固定当前学生和教学班，保留明细条件并拒绝外站和伪造关系", () => {
  const student = "cm12345678901234567890123";
  const classroomId = "cm12345678901234567890124";
  const pathname = `/teacher/assignments/students/${student}`;
  const valid = `${pathname}?classroomId=${classroomId}&section=ALL&submissionFilter=OVERDUE&assignmentKeyword=作业&page=2&returnTo=${encodeURIComponent("/teacher/assignments?view=STUDENTS&studentKeyword=0001&page=3")}`;
  const result = safeStudentWorkReturn(valid, student, classroomId);
  assert.ok(result);
  const url = new URL(result, "http://localhost");
  assert.equal(url.pathname, pathname);
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("submissionFilter"), "OVERDUE");
  assert.match(url.searchParams.get("returnTo") ?? "", /studentKeyword=0001/);
  for (const input of [
    undefined,
    "https://evil.example" + valid,
    "//evil.example" + valid,
    valid.replace(student, classroomId),
    valid.replace(`classroomId=${classroomId}`, `classroomId=${student}`),
    valid + "&page=bad",
    pathname + "?classroomId=invalid",
  ]) {
    assert.equal(safeStudentWorkReturn(input, student, classroomId), undefined);
  }
  const poisoned = `${pathname}?classroomId=${classroomId}&returnTo=https://evil.example`;
  assert.ok(
    !safeStudentWorkReturn(poisoned, student, classroomId)?.includes("evil"),
  );
});

test("个人作答返回支持边界长度的中文查询，避免合法搜索因嵌套编码失效", () => {
  const student = "cm12345678901234567890123";
  const classroomId = "cm12345678901234567890124";
  const keyword = "学".repeat(120);
  const list = studentListHref(
    teacherStudentQuerySchema.parse({ classroomId, studentKeyword: keyword }),
  );
  const params = new URLSearchParams({
    classroomId,
    assignmentKeyword: keyword,
    returnTo: list,
  });
  const work = `/teacher/assignments/students/${student}?${params}`;
  assert.ok(work.length > 2000);
  assert.ok(safeStudentWorkReturn(work, student, classroomId));
});
