import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CourseStatus } from "@prisma/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TeacherCourseList } from "../../components/courses/teacher-course-list";

const course = {
  id: "course-delete-ui",
  template: {
    id: "template-delete-ui",
    code: "python-programming-v1",
    name: "Python 程序设计",
    description: null,
    version: "1.0",
    isBuiltin: true,
  },
  courseNo: "PY-DELETE-01",
  term: "2026-2027-1",
  name: "学生正式导入测试草稿",
  description: "用于课程删除交互测试",
  status: CourseStatus.DRAFT,
  publishedAt: null,
  archivedAt: null,
  classroomCount: 0,
  activeClassroomCount: 0,
  activeStudentCount: 0,
  createdAt: new Date("2026-07-31T00:00:00.000Z"),
  updatedAt: new Date("2026-07-31T00:00:00.000Z"),
};

test("课程卡片的详情链接与删除菜单使用独立交互区域", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherCourseList, {
      initialCourses: [course],
    }),
  );

  assert.match(markup, /学生正式导入测试草稿/u);
  assert.match(markup, /PY-DELETE-01/u);
  assert.match(markup, /打开“学生正式导入测试草稿”课程操作菜单/u);
  assert.match(markup, /href="\/teacher\/courses\/course-delete-ui"/u);
  const links = [...markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gu)];
  assert.equal(links.length, 2);
  assert.equal(
    links.every((link) => !link[1]?.includes("<button")),
    true,
  );
});

test("删除确认交互包含不可恢复提示、loading 和防重复提交", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/teacher-course-list.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /确认删除课程/u);
  assert.match(source, /课程号：\{course\.courseNo\}/u);
  assert.match(source, /删除后无法恢复/u);
  assert.match(source, /if \(isDeleting\) return/u);
  assert.match(source, /disabled=\{isDeleting\}/u);
  assert.match(source, /删除中\.\.\./u);
  assert.match(source, /setCourses\(\(items\) =>/u);
  assert.match(source, /setError\(result\.error\)/u);
  assert.match(source, /aria-live="polite"/u);
});
