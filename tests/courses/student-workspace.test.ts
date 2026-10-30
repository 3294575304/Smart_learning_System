import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  STUDENT_COURSE_TABS,
  parseStudentCourseLocation,
  studentCourseTabHref,
} from "../../services/courses/student-workspace";
import { CourseWorkspaceTabs } from "../../components/learner-profiles/course-workspace-tabs";

test("旧链接映射到正确页签，拒绝非法和重复参数", () => {
  assert.deepEqual(parseStudentCourseLocation(undefined, undefined), {
    tab: "overview",
  });
  assert.deepEqual(parseStudentCourseLocation("tasks", undefined), {
    tab: "tasks",
  });
  for (const [tab, section] of [
    ["knowledge", "knowledge"],
    ["path", "path"],
    ["profile", "profile"],
    ["activity", "trends"],
    ["growth", "knowledge"],
  ]) {
    assert.deepEqual(parseStudentCourseLocation(tab, undefined), {
      tab: "growth",
      section,
    });
  }
  for (const [tab, section] of [
    ["", undefined],
    ["invalid", undefined],
    [["profile", "tasks"], undefined],
    ["growth", ["path"]],
    ["tasks", "profile"],
    ["growth", "bad"],
  ])
    assert.equal(parseStudentCourseLocation(tab, section), null);
});

test("三页签只有一个当前状态，切换保持课程与教学班", () => {
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
      const href = studentCourseTabHref("course", "class1", tab.id);
      assert.ok(html.includes(href.replaceAll("&", "&amp;")));
    }
  }
  assert.notEqual(
    studentCourseTabHref("course", "class1", "growth", "profile"),
    studentCourseTabHref("course", "class2", "growth", "profile"),
  );
});
