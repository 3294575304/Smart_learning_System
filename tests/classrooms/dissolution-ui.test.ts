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

test("解散确认只要求原因，并在课程管理页提供直接入口和完整反馈", async () => {
  const dialogSource = await readFile(
    new URL(
      "../../components/classrooms/dissolve-classroom-dialog.tsx",
      import.meta.url,
    ),
    "utf8",
  );
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
  assert.match(dialogSource, /解散原因/u);
  assert.match(dialogSource, /reason\.trim\(\)\.length < 2/u);
  assert.match(
    dialogSource,
    /JSON\.stringify\(\{ reason: normalizedReason \}\)/u,
  );
  assert.match(dialogSource, /if \(isDissolving/u);
  assert.match(dialogSource, /disabled=\{isDissolving/u);
  assert.match(dialogSource, /解散中\.\.\./u);
  assert.match(dialogSource, /既有作业、成绩和学习记录会保留/u);
  assert.doesNotMatch(dialogSource, /请输入完整班级名称/u);
  assert.match(listSource, /setClassrooms\(\(items\) =>/u);
  assert.match(listSource, /历史教学数据已保留/u);
  assert.match(listSource, /event\.stopPropagation\(\)/u);
  assert.match(courseSource, /解散班级/u);
  assert.match(courseSource, /setDissolvingClassroom/u);
  assert.match(courseSource, /notifiedStudentCount/u);
});
