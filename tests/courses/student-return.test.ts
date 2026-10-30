import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { studentCourseReturnHref } from "../../services/courses/student-return";
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
  assert.match(html, /返回我的课程/);
  assert.match(html, /focus-visible:outline/);
  assert.match(html, /bg-sky-600/);
  assert.match(html, /text-white/);
  assert.doesNotMatch(html, /bg-white/);
  assert.ok(
    html.includes(
      studentCourseReturnHref(courseId, classroomId).replaceAll("&", "&amp;"),
    ),
  );
});

test("图谱与其他返回入口复用原生链接，保留栏目与班级", () => {
  const href = `/student/courses/${courseId}/learning-center?tab=knowledge&classroomId=${classroomId}`;
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
