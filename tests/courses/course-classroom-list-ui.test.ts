import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CourseClassroomManager } from "../../components/courses/course-classroom-manager";
import type { TeacherCourseClassroomView } from "../../services/courses/types";

Object.assign(globalThis, { React });
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};
const linked: TeacherCourseClassroomView = {
  id: "linked",
  name: "已关联测试班",
  description: null,
  status: "ACTIVE",
  allowStudentLeave: false,
  studentCount: 1,
  currentCourse: {
    id: "course-a",
    name: "Python",
    courseNo: "PY",
    term: "term",
    status: "ACTIVE",
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};
function render(classrooms: TeacherCourseClassroomView[]) {
  return renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: router },
      React.createElement(CourseClassroomManager, {
        courseId: "course-a",
        linkedClassrooms: [linked],
        classrooms,
      }),
    ),
  );
}
test("已关联班级不重复出现在可关联列表，未关联班级仍可选择", () => {
  const html = render([
    linked,
    { ...linked, id: "other", name: "可关联测试班", currentCourse: null },
  ]);
  assert.equal((html.match(/已关联测试班/g) ?? []).length, 1);
  assert.equal((html.match(/可关联测试班/g) ?? []).length, 1);
  assert.match(html, /关联到此课程/u);
  assert.match(html, /teaching-progress\?classroomId=linked/u);
});
test("全部班级已关联时显示明确空状态并保留已关联管理", () => {
  const html = render([linked]);
  assert.match(html, /现有班级均已关联当前课程/u);
  assert.match(html, /解除关联/u);
  assert.doesNotMatch(html, /关联到此课程/u);
});
