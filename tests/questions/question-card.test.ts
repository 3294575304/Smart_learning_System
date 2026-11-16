import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { QuestionList } from "@/components/questions/question-list";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { QuestionListItem } from "@/services/questions/types";

Object.assign(globalThis, { React });
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};
const base: QuestionListItem = {
  id: "question-card",
  title: "函数定义",
  content: "选择正确的函数定义。",
  type: "SINGLE_CHOICE",
  origin: "AI_GENERATED",
  status: "ACTIVE",
  questionCategoryId: "python-category",
  questionCategoryName: "Python 程序设计",
  revision: 1,
  tags: ["函数"],
  creator: { id: "teacher", displayName: "示例教师" },
  knowledgePoints: [],
  courseGraphConcepts: [{ id: "concept", code: "C01", name: "函数定义" }],
  courseObjective: { code: "1", title: "知识" },
  assignmentReferenceCount: 3,
  canEdit: true,
  canDelete: true,
  createdAt: new Date("2026-11-15T00:00:00Z"),
  updatedAt: new Date("2026-11-15T00:00:00Z"),
};
function render(items: QuestionListItem[]) {
  return renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: router },
      React.createElement(QuestionList, { items, courseId: "course" }),
    ),
  );
}

test("六种题型保留明确文字和独立类型标识，并保留详情与管理入口", () => {
  for (const type of Object.keys(
    QUESTION_TYPE_LABELS,
  ) as QuestionListItem["type"][]) {
    const html = render([{ ...base, type }]);
    assert.ok(html.includes(QUESTION_TYPE_LABELS[type]));
    assert.ok(html.includes(`data-question-type="${type}"`));
    assert.match(html, /href="\/teacher\/questions\/question-card"/u);
    assert.match(html, /href="\/teacher\/questions\/question-card\/edit"/u);
    assert.match(html, /aria-label="归档题目"/u);
    assert.match(html, /AI 候选 · 直接采纳/u);
    assert.match(html, /C01 · 函数定义/u);
    assert.match(html, /已被 3 份作业引用/u);
  }
});

test("课程目标未分类与未绑定课程知识点不会伪装成全局分类", () => {
  const unbound = render([
    {
      ...base,
      courseObjective: null,
      defaultObjectiveKind: "KNOWLEDGE",
      courseGraphConcepts: [],
    },
  ]);
  assert.match(unbound, /课程目标：待分类/u);
  assert.match(unbound, /此题尚未绑定到所选课程/u);
  assert.doesNotMatch(unbound, /课程目标：1 · 知识/u);
  const noCourse = render([{ ...base, courseGraphConcepts: undefined }]);
  assert.match(noCourse, /选择课程后查看该课程的知识点分类/u);
});

test("草稿、题干核对与空结果继续保留，卡片不增加不存在的作答预览", () => {
  const html = render([
    {
      ...base,
      status: "DRAFT",
      content: "题干\n参考答案：示例",
      assignmentReferenceCount: 0,
    },
  ]);
  assert.match(html, /草稿 · 待配置/u);
  assert.match(html, /待核对题干/u);
  assert.doesNotMatch(html, /已被 0 份作业引用|预览题目/u);
  assert.match(render([]), /没有符合条件的题目/u);
});
