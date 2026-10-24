import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  CourseClassroomManager,
  parseClassroomCount,
} from "../../components/courses/course-classroom-manager";
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
        courseName: "Python",
        courseNo: "PY",
        term: "term",
        courseStatus: "ACTIVE",
        linkedClassrooms: classrooms,
      }),
    ),
  );
}
test("课程建设默认创建一个班级并保留既有班级管理入口", () => {
  const html = render([linked]);
  assert.equal((html.match(/已关联测试班/g) ?? []).length, 1);
  assert.match(html, /创建课程班级/u);
  assert.match(html, /要创建的班级个数/u);
  assert.match(html, /value="1"/u);
  assert.match(html, /teacher\/classrooms\/linked/u);
  assert.match(html, /teaching-progress\?classroomId=linked/u);
  assert.match(html, /profiles\?classroomId=linked/u);
  assert.match(html, /students\/import\?classroomId=linked/u);
  assert.doesNotMatch(html, /关联到此课程|解除关联/u);
});
test("尚无课程班级时引导创建", () => {
  const html = render([]);
  assert.match(html, /暂无课程班级/u);
  assert.match(html, /开始逐个创建/u);
  assert.doesNotMatch(html, /关联到此课程/u);
});

test("班级数量只校验正安全整数，不设业务上限", () => {
  assert.equal(parseClassroomCount("1"), 1);
  assert.equal(parseClassroomCount("10000"), 10000);
  for (const input of ["0", "-1", "1.5", "abc", "9007199254740992"]) {
    assert.equal(parseClassroomCount(input), null);
  }
});
