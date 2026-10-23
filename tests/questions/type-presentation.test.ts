import assert from "node:assert/strict";
import test from "node:test";
import { QuestionType } from "@prisma/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

import { QuestionFilters } from "@/components/questions/question-filters";
import { QuestionForm } from "@/components/questions/question-form";
import {
  questionListQuerySchema,
  questionUpsertSchema,
} from "@/services/questions/schemas";
import type { QuestionDetail } from "@/services/questions/types";

Object.assign(globalThis, { React });
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};
function render(element: React.ReactNode) {
  return renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: router }, element),
  );
}

test("course filters explain unavailable concepts and retain course selection", () => {
  const courseId = "ccourse00000000000000001";
  const linkedCourseId = "ccourse00000000000000002";
  const html = render(
    React.createElement(QuestionFilters, {
      query: questionListQuerySchema.parse({ courseId: linkedCourseId }),
      courses: [
        {
          id: courseId,
          courseIds: [courseId, linkedCourseId],
          questionCategoryId: "ccategory00000000000000001",
          name: "英语",
          term: "2026",
          courseNo: "EN",
          classrooms: [],
          concepts: [],
        },
      ],
      categories: [],
    }),
  );
  assert.match(html, /暂无正式知识点/u);
  assert.match(html, /尚未发布正式知识图谱/u);
  assert.match(html, /重置筛选/u);
  assert.match(html, /value="ccourse00000000000000001" selected/u);
  assert.match(html, /disabled=""/u);
});
function question(type: QuestionType): QuestionDetail {
  return {
    id: "cquestion0000000000000001",
    title: "通用课程题目",
    content: "请给出解答过程。",
    type,
    difficulty: 3,
    status: "ACTIVE",
    questionCategoryId: "ccategory00000000000000001",
    questionCategoryName: "Python 程序设计",
    revision: 1,
    tags: [],
    creator: { id: "cteacher0000000000000001", displayName: "教师" },
    knowledgePoints: [],
    assignmentReferenceCount: 0,
    canEdit: true,
    canDelete: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    explanation: "参考解析",
    options: [],
    answer:
      type === QuestionType.PYTHON_PROGRAMMING
        ? { kind: "PROGRAMMING" }
        : { kind: "REFERENCE", value: "参考答案与步骤" },
  };
}

test("historical programming filters retain their value while displaying a course-neutral type", () => {
  const html = render(
    React.createElement(QuestionFilters, {
      query: questionListQuerySchema.parse({ type: "PYTHON_PROGRAMMING" }),
      courses: [],
      categories: [],
    }),
  );
  assert.match(html, /value="PYTHON_PROGRAMMING" selected="">编程题/u);
  assert.match(html, /optgroup label="客观题"/u);
  assert.match(html, /optgroup label="主观题"/u);
  assert.match(html, /optgroup label="实践题"/u);
  assert.doesNotMatch(html, /Python 编程题|C 编程题|Java 编程题/u);
});

test("subjective question editing supports mathematics, English and code analysis with the existing answer contract", () => {
  const detail = question(QuestionType.SHORT_ANSWER);
  const html = render(
    React.createElement(QuestionForm, {
      mode: "edit",
      knowledgePoints: [],
      categories: [
        { id: "ccategory00000000000000001", name: "Python 程序设计" },
      ],
      question: detail,
    }),
  );
  assert.match(html, /数学推导、英语写作或代码分析/u);
  assert.match(html, /教师人工批改/u);
  assert.match(html, /参考答案与评分要点/u);
  for (const title of ["高等数学：极限推导", "英语：写作", "Java：代码分析"]) {
    assert.ok(
      questionUpsertSchema.safeParse({
        title,
        content: detail.content,
        type: detail.type,
        difficulty: detail.difficulty,
        options: [],
        answer: detail.answer,
        explanation: detail.explanation,
        knowledgePointIds: ["cknowledge00000000000001"],
        tags: [],
        questionCategoryId: detail.questionCategoryId,
        revision: detail.revision,
      }).success,
    );
  }
});

test("programming creation uses a generic type but clearly states the supported execution language", () => {
  const html = render(
    React.createElement(QuestionForm, {
      mode: "edit",
      knowledgePoints: [],
      categories: [
        { id: "ccategory00000000000000001", name: "Python 程序设计" },
      ],
      question: question(QuestionType.PYTHON_PROGRAMMING),
    }),
  );
  assert.match(html, /aria-pressed="true"[^>]*><span[^>]*>编程题/u);
  assert.match(html, /当前自动判题执行语言为 Python/u);
  assert.doesNotMatch(
    html,
    /<option[^>]*>C<\/option>|<option[^>]*>Java<\/option>/u,
  );
});

test("六种题型入口可见，选中状态明确，编程创建提供下一步", () => {
  const html = render(
    React.createElement(QuestionForm, {
      mode: "create",
      knowledgePoints: [],
      categories: [
        { id: "ccategory00000000000000001", name: "Python 程序设计" },
      ],
    }),
  );
  assert.equal((html.match(/aria-pressed=/gu) ?? []).length, 6);
  assert.match(html, /选择题型/u);
  assert.match(html, /切换题型会保留/u);
  assert.match(html, /支持 2–20 个选项/u);
  assert.doesNotMatch(html, /name="correct-option"[^>]* checked/u);
});

test("高级筛选默认折叠，已选知识点或难度时展开，筛选值不丢失", () => {
  const plain = render(
    React.createElement(QuestionFilters, {
      query: questionListQuerySchema.parse({}),
      courses: [],
      categories: [],
    }),
  );
  assert.match(plain, /更多筛选/u);
  assert.doesNotMatch(plain, /<details[^>]*open/u);
  const selected = render(
    React.createElement(QuestionFilters, {
      query: questionListQuerySchema.parse({ difficulty: 4 }),
      courses: [],
      categories: [],
    }),
  );
  assert.match(selected, /<details[^>]*open/u);
  assert.match(selected, /value="4" selected/u);
});
