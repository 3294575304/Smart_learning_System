import assert from "node:assert/strict";
import test from "node:test";

import { QuestionType, RecommendationStatus } from "@prisma/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { QuestionAnswerInput } from "../../components/assignments/question-answer-input";
import { isGenerateRecommendationDisabled } from "../../components/recommendations/generate-recommendations-form";
import { RecommendationCard } from "../../components/recommendations/recommendation-card";
import { RecommendationEmptyState } from "../../components/recommendations/recommendation-empty-state";
import { RecommendationFilters } from "../../components/recommendations/recommendation-filters";
import { isStartRecommendationDisabled } from "../../components/recommendations/start-recommendation-button";

const recommendation = {
  id: "recommendation-1",
  questionId: "question-1",
  title: "分数加法",
  content: "题目内容",
  type: QuestionType.SINGLE_CHOICE,
  difficulty: 2,
  knowledgePoints: [{ id: "kp-1", name: "异分母分数" }],
  reason: "你近期在异分母分数计算中容易出错，建议巩固基础步骤。",
  status: RecommendationStatus.STARTED,
  createdAt: "2026-07-21T08:00:00.000Z",
  expiresAt: "2026-07-28T08:00:00.000Z",
  answer: "不应显示的标准答案",
  explanation: "不应显示的完整解析",
};

test("recommendation card renders reason, knowledge, difficulty and status safely", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RecommendationCard, {
      item: recommendation,
      action: React.createElement("span", null, "继续练习"),
    }),
  );

  assert.match(markup, /单选题/u);
  assert.match(markup, /难度：简单/u);
  assert.match(markup, /进行中/u);
  assert.match(markup, /异分母分数/u);
  assert.match(markup, /建议巩固基础步骤/u);
  assert.match(markup, /继续练习/u);
  assert.doesNotMatch(markup, /不应显示的标准答案|不应显示的完整解析/u);
});

test("empty and filtered states use distinct student-friendly messages", () => {
  const empty = renderToStaticMarkup(
    React.createElement(RecommendationEmptyState, { kind: "none" }),
  );
  const filtered = renderToStaticMarkup(
    React.createElement(RecommendationEmptyState, { kind: "filtered" }),
  );
  assert.match(empty, /还没有推荐练习/u);
  assert.match(filtered, /当前筛选条件下没有记录/u);
});

test("answer input reuses choice controls without exposing an answer", () => {
  const markup = renderToStaticMarkup(
    React.createElement(QuestionAnswerInput, {
      answer: { kind: "CHOICE", optionIds: [] },
      onChange: () => undefined,
      question: {
        id: "question-1",
        type: QuestionType.SINGLE_CHOICE,
        options: [
          { id: "option-1", label: "A", content: "选项一", sortOrder: 1 },
          { id: "option-2", label: "B", content: "选项二", sortOrder: 2 },
        ],
      },
    }),
  );
  assert.match(markup, /type="radio"/u);
  assert.match(markup, /请选择一个答案/u);
  assert.doesNotMatch(markup, /标准答案|完整解析/u);
});

test("pending requests disable generation and start actions", () => {
  assert.equal(isGenerateRecommendationDisabled(true, 1), true);
  assert.equal(isGenerateRecommendationDisabled(false, 0), true);
  assert.equal(isGenerateRecommendationDisabled(false, 1), false);
  assert.equal(isStartRecommendationDisabled(true), true);
  assert.equal(isStartRecommendationDisabled(false), false);
});

test("status filters provide keyboard links and constrain horizontal overflow", () => {
  const markup = renderToStaticMarkup(
    React.createElement(RecommendationFilters, {
      activeStatus: RecommendationStatus.PENDING,
    }),
  );
  assert.match(markup, /待练习/u);
  assert.match(markup, /进行中/u);
  assert.match(markup, /已完成/u);
  assert.match(markup, /overflow-x-auto/u);
  assert.match(markup, /aria-current="page"/u);
});
