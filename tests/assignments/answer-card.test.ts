import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AnswerSheetPanel,
  type AnswerSheetQuestion,
} from "../../components/assignments/answer-sheet-panel";
import {
  gradingAnswerCardLegend,
  gradingAnswerCardState,
  studentResultAnswerCardState,
} from "../../components/assignments/answer-card-states";

const questions: AnswerSheetQuestion[] = [
  { id: "first", sortOrder: 1, type: "SHORT_ANSWER" },
  { id: "second", sortOrder: 2, type: "PYTHON_PROGRAMMING" },
];

test("read-only answer card keeps type segments without guessing answered state", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(AnswerSheetPanel, {
      questions,
      activeIndex: -1,
      answeredCount: 0,
      groupByType: true,
      legendItems: [],
      plainNumbers: true,
      showProgress: false,
      onSelect: () => undefined,
    }),
  );
  assert.deepEqual(
    [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]),
    ["简答与解答题 · 1 题", "编程题 · 1 题"],
  );
  assert.match(html, /aria-label="第 1 题"/);
  assert.match(html, /aria-label="第 2 题"/);
  // 只读场景没有作答状态，不能把每题都标成「未作答」，也不显示虚假进度。
  assert.doesNotMatch(html, /未作答/);
  assert.doesNotMatch(html, /已完成/);
  assert.doesNotMatch(html, /0 \/ 2/);
});

test("answer card keeps the progress bar when a countable state is supplied", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(AnswerSheetPanel, {
      questions,
      activeIndex: -1,
      answeredCount: 1,
      groupByType: true,
      onSelect: () => undefined,
      progressLabel: "已作答",
    }),
  );
  assert.match(html, /已作答 1 \/ 2/);
  assert.match(html, /50%/);
});

test("grading answer card maps every outcome to one shared tone", () => {
  assert.equal(gradingAnswerCardState("CORRECT").label, "回答正确");
  assert.match(gradingAnswerCardState("CORRECT").className, /emerald/);
  assert.equal(gradingAnswerCardState("WRONG").label, "回答错误");
  assert.match(gradingAnswerCardState("WRONG").className, /rose/);
  assert.match(gradingAnswerCardState("PARTIAL").className, /amber/);
  assert.equal(gradingAnswerCardState("PENDING_REVIEW").label, "待批改");
  assert.match(gradingAnswerCardState("PENDING_JUDGE").className, /violet/);
  assert.equal(gradingAnswerCardState("MISSING").label, "缺少作答记录");
  assert.deepEqual(
    gradingAnswerCardLegend.map((item) => item.label),
    ["答对", "答错", "部分得分", "待处理"],
  );
});

test("student result answer card separates unpublished work from scored work", () => {
  assert.equal(studentResultAnswerCardState(null).label, "已提交");
  assert.equal(
    studentResultAnswerCardState({ score: null, isCorrect: null }).label,
    "待批改",
  );
  assert.equal(
    studentResultAnswerCardState({ score: 10, isCorrect: true }).label,
    "满分",
  );
  assert.equal(
    studentResultAnswerCardState({ score: 0, isCorrect: false }).label,
    "未得分",
  );
  assert.equal(
    studentResultAnswerCardState({ score: 4, isCorrect: false }).label,
    "部分得分",
  );
});
