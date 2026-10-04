import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoursePracticeCenter } from "../../components/recommendations/course-practice-center";

Object.assign(globalThis, { React });

test("未配置授课进度仍显示可用自主练习入口与实际题量说明", () => {
  const html = renderToStaticMarkup(
    React.createElement(CoursePracticeCenter, {
      courses: courses.map((course) => ({
        ...course,
        progressRevisionNumber: null,
      })),
      initialCourseId: "python",
      initialConceptId: "loop",
    }),
  );
  assert.match(html, /自主练习不受教师教学进度限制/u);
  assert.match(html, /按实际可用题目开始练习/u);
  assert.doesNotMatch(html, /教师尚未|教学进度修订/u);
  assert.match(html, /生成练习（20 题）/u);
});

const courses = [
  {
    courseId: "python",
    courseName: "Python",
    classroomId: "class",
    classroomName: "一班",
    graphVersionNumber: 2,
    progressRevisionNumber: 1,
    concepts: [
      { id: "loop", code: "KP1", name: "循环" },
      { id: "list", code: "KP2", name: "列表" },
    ],
    chapters: [
      { id: "ch1", code: "CH1", name: "循环结构", conceptIds: ["loop"] },
      { id: "ch2", code: "CH2", name: "数据结构", conceptIds: ["list"] },
    ],
  },
];

test("AI 章节入口进入练习中心后只预选对应章节", () => {
  const html = renderToStaticMarkup(
    React.createElement(CoursePracticeCenter, {
      courses,
      initialCourseId: "python",
      initialChapterId: "ch2",
    }),
  );
  assert.match(html, /checked=""\/>CH2/u);
  assert.doesNotMatch(html, /checked=""\/>CH1/u);
  assert.match(html, /1 个大章节/u);
});
test("AI 测试入口预选测试模式与固定测试模板", () => {
  const html = renderToStaticMarkup(
    React.createElement(CoursePracticeCenter, {
      courses,
      initialCourseId: "python",
      initialConceptId: "loop",
      initialMode: "TEST",
    }),
  );
  assert.match(html, /当前知识点：循环/u);
  assert.match(html, /生成测试（50 题）/u);
  assert.doesNotMatch(html, /练习模板/u);
});
test("陌生章节不会被当作已确认的练习范围", () => {
  const html = renderToStaticMarkup(
    React.createElement(CoursePracticeCenter, {
      courses,
      initialCourseId: "python",
      initialChapterId: "foreign-chapter",
    }),
  );
  assert.doesNotMatch(html, /type="checkbox" checked/u);
});

test("AI 多章节确认入口预选所有章节、模板与难度", () => {
  const html = renderToStaticMarkup(
    React.createElement(CoursePracticeCenter, {
      courses,
      initialCourseId: "python",
      initialChapterIds: ["ch1", "ch2"],
      initialDifficulty: 2,
      initialTemplate: "TRUE_FALSE10",
    }),
  );
  assert.match(html, /checked=""\/>CH1/u);
  assert.match(html, /checked=""\/>CH2/u);
  assert.match(html, /生成练习（10 题）/u);
});
