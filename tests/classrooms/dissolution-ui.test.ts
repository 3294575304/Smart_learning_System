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

test("班级卡片显示明确的授课状态并保留独立详情入口", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherClassroomList, {
      initialClassrooms: [classroom],
    }),
  );
  assert.match(markup, /授课中/u);
  assert.doesNotMatch(markup, /解散班级|操作菜单/u);
  assert.match(markup, /href="\/teacher\/classrooms\/classroom-ui-test"/u);
  assert.equal(
    [...markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gu)].every(
      (link) => !link[1]?.includes("<button"),
    ),
    true,
  );
});

test("教师结课入口取代关闭和解散，课程班级页保持统一入口", async () => {
  const listSource = await readFile(
    new URL(
      "../../components/classrooms/teacher-classroom-list.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const courseSource = await readFile(
    new URL(
      "../../components/courses/course-classroom-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const controls = await readFile(
    new URL(
      "../../components/classrooms/teacher-classroom-controls.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(listSource, /DissolveClassroomDialog|解散班级/);
  assert.doesNotMatch(courseSource, /DissolveClassroomDialog|解散班级/);
  assert.match(courseSource, /确认结课/);
  assert.match(controls, /确认结课/);
  assert.match(controls, /classroomId}\/complete/);
  assert.doesNotMatch(controls, /关闭班级/);
});
