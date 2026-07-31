import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TeacherClassroomList } from "../../components/classrooms/teacher-classroom-list";

const classroom = {
  id: "classroom-ui-test",
  name: "Python 测试班",
  description: null,
  joinCode: "PYTHON01",
  status: "ACTIVE" as const,
  allowStudentLeave: false,
  studentCount: 2,
  course: { id: "course-ui-test", name: "Python 程序设计" },
  createdAt: new Date("2026-07-31T00:00:00.000Z"),
};

test("班级卡片详情和操作菜单使用独立交互区域", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherClassroomList, {
      initialClassrooms: [classroom],
    }),
  );
  assert.match(markup, /打开“Python 测试班”班级操作菜单/u);
  assert.match(markup, /href="\/teacher\/classrooms\/classroom-ui-test"/u);
  assert.equal(
    [...markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gu)].every(
      (link) => !link[1]?.includes("<button"),
    ),
    true,
  );
});

test("解散确认要求完整班级名并提供 loading、防重复提交和即时移除", async () => {
  const source = await readFile(
    new URL(
      "../../components/classrooms/teacher-classroom-list.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /请输入完整班级名称以确认/u);
  assert.match(source, /confirmation !== classroom\.name/u);
  assert.match(source, /if \(isDissolving/u);
  assert.match(source, /disabled=\{isDissolving/u);
  assert.match(source, /解散中\.\.\./u);
  assert.match(source, /学生账号不会被删除/u);
  assert.match(source, /此操作无法恢复/u);
  assert.match(source, /setClassrooms\(\(items\) =>/u);
  assert.match(source, /班级已解散，学生账号未删除/u);
  assert.match(source, /event\.stopPropagation\(\)/u);
});
