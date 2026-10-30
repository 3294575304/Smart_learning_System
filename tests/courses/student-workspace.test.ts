import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  STUDENT_COURSE_TABS,
  parseStudentCourseTab,
  studentCourseTabHref,
} from "../../services/courses/student-workspace";
import { CourseWorkspaceTabs } from "../../components/learner-profiles/course-workspace-tabs";
test("课程栏目默认概览，拒绝无效和重复参数", () => {
  assert.equal(parseStudentCourseTab(undefined), "overview");
  for (const value of ["", "invalid", ["profile", "tasks"], null, 3])
    assert.equal(parseStudentCourseTab(value), null);
  for (const tab of STUDENT_COURSE_TABS)
    assert.equal(parseStudentCourseTab(tab.id), tab.id);
  assert.equal(parseStudentCourseTab("tasks"), "overview");
  assert.equal(parseStudentCourseTab("path"), "knowledge");
  assert.equal(parseStudentCourseTab("activity"), "profile");
});
test("每个栏目只有一个当前状态，所有切换都保持对应课程与教学班", () => {
  for (const selected of STUDENT_COURSE_TABS) {
    const html = renderToStaticMarkup(
      React.createElement(CourseWorkspaceTabs, {
        courseId: "course",
        classroomId: "class1",
        tab: selected.id,
      }),
    );
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.equal((html.match(/<a /g) ?? []).length, 3);
    for (const tab of STUDENT_COURSE_TABS) {
      assert.ok(html.includes(tab.label));
      const url = new URL(
        studentCourseTabHref("course", "class1", tab.id),
        "http://localhost",
      );
      assert.equal(url.searchParams.get("classroomId"), "class1");
      assert.equal(url.searchParams.get("tab"), tab.id);
      assert.ok(
        html.includes(url.pathname + url.search.replaceAll("&", "&amp;")),
      );
    }
  }
  assert.notEqual(
    studentCourseTabHref("course", "class1", "profile"),
    studentCourseTabHref("course", "class2", "profile"),
  );
});
