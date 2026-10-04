import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { LearningAssistantPanel } from "../../components/recommendations/learning-assistant-panel";

Object.assign(globalThis, { React });
const courses = [
  {
    courseId: "python",
    courseName: "Python 程序设计",
    concepts: [{ id: "loop", name: "while循环" }],
    chapters: [],
  },
];
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};
function render(props: React.ComponentProps<typeof LearningAssistantPanel>) {
  return renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: router },
      React.createElement(LearningAssistantPanel, props),
    ),
  );
}
test("单课程直接输入，主题可选且默认折叠，同课程班级不产生重复课程选择", () => {
  const html = render({ courses: [...courses, ...courses] });
  assert.match(html, /直接输入课程疑问/u);
  assert.match(html, /自动识别，不限制章节/u);
  assert.doesNotMatch(html, /<details[^>]*\bopen/u);
  assert.equal((html.match(/<select/g) ?? []).length, 1);
  assert.doesNotMatch(html, /先选择上方|先选学习主题/u);
});
test("多课程保留切换，图谱进入保留明确主题", () => {
  const html = render({
    courses: [
      ...courses,
      { ...courses[0], courseId: "second", courseName: "另一课程" },
    ],
    initialConceptId: "loop",
  });
  assert.equal((html.match(/<select/g) ?? []).length, 2);
  assert.match(html, /当前主题：while循环/u);
  assert.match(html, /value="KNOWLEDGE_POINT:loop" selected/u);
});
