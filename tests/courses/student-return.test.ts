import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { studentCourseReturnHref } from "../../services/courses/student-return";
import { studentCourseTabHref } from "../../services/courses/student-workspace";
import { StudentCourseReturnLink } from "../../components/dashboard/student-course-return-link";
import { StudentBackLink } from "../../components/dashboard/student-back-link";

const courseId = "cmti1qeu20005yg6s1ufqyjrl";
const classroomId = "cmumfatvk0001xqu4a99tz03z";
test("已指定课程与班级时返回原课程概况，不丢失班级", () => {
  const href = studentCourseReturnHref(courseId, classroomId);
  const url = new URL(href, "http://localhost");
  assert.equal(url.pathname, `/student/courses/${courseId}/learning-center`);
  assert.equal(url.searchParams.get("classroomId"), classroomId);
  assert.equal(url.searchParams.get("tab"), "overview");
  assert.notEqual(
    href,
    studentCourseReturnHref(courseId, "cmti1rif10031yg6se068b18c"),
  );
});
test("无完整班级上下文和恶意参数只提供站内我的课程出口", () => {
  for (const [course, classroom] of [
    [undefined, undefined],
    [courseId, undefined],
    ["https://evil.example", classroomId],
    [courseId, "../../admin"],
    [[courseId], classroomId],
    [courseId, "javascript:alert(1)"],
  ])
    assert.equal(
      studentCourseReturnHref(course, classroom),
      "/student/courses",
    );
});
test("返回入口有明确按钮文案及键盘焦点样式", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentCourseReturnLink, { courseId, classroomId }),
  );
  assert.match(html, /返回课程学习中心/);
  assert.match(html, /focus-visible:outline/);
  // 主操作按钮底色用 sky-700，白字对比度 5.76:1；sky-600 只有 4.10:1，不达标。
  assert.match(html, /bg-sky-700/);
  assert.match(html, /text-white/);
  assert.doesNotMatch(html, /bg-white/);
  assert.ok(
    html.includes(
      studentCourseReturnHref(courseId, classroomId).replaceAll("&", "&amp;"),
    ),
  );
});

test("作业与图谱返回链接保留同班及对应页签", () => {
  const tasks = studentCourseReturnHref(courseId, classroomId, "tasks");
  assert.equal(
    tasks,
    `/student/courses/${courseId}/learning-center?classroomId=${classroomId}&tab=tasks`,
  );
  const taskReturn = renderToStaticMarkup(
    React.createElement(StudentCourseReturnLink, {
      courseId,
      classroomId,
      tab: "tasks",
    }),
  );
  assert.match(taskReturn, /返回课程任务/);
  assert.ok(taskReturn.includes(tasks.replaceAll("&", "&amp;")));
  const fallback = renderToStaticMarkup(
    React.createElement(StudentCourseReturnLink, {
      courseId,
      classroomId: "invalid",
      tab: "tasks",
    }),
  );
  assert.match(fallback, /href="\/student\/courses".*>返回我的课程</);
  const href = studentCourseTabHref(
    courseId,
    classroomId,
    "growth",
    "knowledge",
  );
  assert.equal(
    href,
    `/student/courses/${courseId}/learning-center?classroomId=${classroomId}&tab=growth&section=knowledge`,
  );
  const html = renderToStaticMarkup(
    StudentBackLink({
      href,
      children: "返回课程学习中心",
    }),
  );
  assert.match(html, /^<a /);
  assert.ok(html.includes(href.replaceAll("&", "&amp;")));
  assert.match(html, /返回课程学习中心/);
});
