import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CourseRosterManager } from "../../components/courses/course-roster-manager";

Object.assign(globalThis, { React });

const data = {
  course: { id: "course-a", name: "测试课程" },
  classrooms: [
    { id: "class-a", name: "一班" },
    { id: "class-b", name: "二班" },
  ],
  counts: { active: 0, pending: 0, removed: 0 },
  total: 0,
  page: 1,
  pages: 1,
  items: [],
};
function render(lockedClassroomId?: string) {
  return renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      {
        value: {
          back() {},
          forward() {},
          refresh() {},
          push() {},
          replace() {},
          prefetch() {},
        },
      },
      React.createElement(CourseRosterManager, {
        courseId: "course-a",
        initialData: data,
        lockedClassroomId,
      }),
    ),
  );
}
test("课程名单保留跨班筛选，班级管理锁定当前班级并保留完整名单操作", () => {
  assert.match(render(), /aria-label="班级范围"/);
  const locked = render("class-a");
  assert.doesNotMatch(locked, /aria-label="班级范围"|全部课程班级/);
  assert.match(locked, /待认领/);
  assert.match(locked, /已移出/);
  assert.match(locked, /添加学生/);
  assert.match(locked, /搜索姓名或学号/);
  assert.match(locked, /disabled=""[^>]*>重置筛选/);
});
