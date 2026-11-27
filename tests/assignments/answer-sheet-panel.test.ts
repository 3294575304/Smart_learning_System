import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AnswerSheetPanel,
  type AnswerSheetQuestion,
} from "../../components/assignments/answer-sheet-panel";
import { ExamReceiptAnswerSheet } from "../../components/exams/exam-receipt-answer-sheet";
import { publishedReceiptOutcome } from "../../services/assignments/answer-presentation";

Object.assign(globalThis, { React });

test("answer card separates adjacent types without reordering an interleaved paper", () => {
  const questions: AnswerSheetQuestion[] = [
    { id: "first", sortOrder: 1, type: "SINGLE_CHOICE" },
    { id: "second", sortOrder: 2, type: "SINGLE_CHOICE" },
    { id: "third", sortOrder: 3, type: "SHORT_ANSWER" },
    { id: "fourth", sortOrder: 4, type: "SINGLE_CHOICE" },
    { id: "last", sortOrder: 5, type: "PYTHON_PROGRAMMING" },
  ];
  const html = renderToStaticMarkup(
    React.createElement(AnswerSheetPanel, {
      questions,
      activeIndex: 2,
      answeredCount: 1,
      isAnswered: (id) => id === "first",
      groupByType: true,
      onSelect: () => undefined,
    }),
  );
  assert.deepEqual(
    [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((match) => match[1]),
    ["单选题 · 2 题", "简答与解答题 · 1 题", "单选题 · 1 题", "编程题 · 1 题"],
  );
  assert.deepEqual(
    [...html.matchAll(/aria-label="第 (\d+) 题/g)].map((match) => match[1]),
    ["1", "2", "3", "4", "5"],
  );
  assert.match(
    html,
    /aria-current="step" aria-label="第 3 题（当前题 · 未作答）"/,
  );
  assert.match(html, /aria-label="第 1 题（已作答）"/);
});

test("交卷答题卡用整卷数据统计，公布前隐藏批改结果", () => {
  const questions = Array.from({ length: 15 }, (_, index) => ({
    id: String(index + 1),
    sortOrder: index + 1,
    type:
      index < 10 ? ("SINGLE_CHOICE" as const) : ("PYTHON_PROGRAMMING" as const),
    answered: index < 7,
    outcome: publishedReceiptOutcome({
      score: index < 4 ? 5 : 0,
      maxScore: 5,
      gradingStatus: "AUTO_GRADED",
    }),
  }));
  const render = (published: boolean) =>
    renderToStaticMarkup(
      React.createElement(ExamReceiptAnswerSheet, {
        questions,
        totalPoints: 100,
        published,
      }),
    );
  const published = render(true);
  assert.match(published, /15 题 · 100 分/);
  assert.match(published, /已作答 7 \/ 15/);
  assert.match(published, /答对 4/);
  assert.match(published, /答错 11/);
  assert.match(published, /未作答 8/);
  assert.match(published, /单选题 · 10 题/);
  assert.match(published, /编程题 · 5 题/);
  assert.match(published, /第 8 题（未作答 · 答错）/);
  const unpublished = render(false);
  assert.match(unpublished, /第 8 题（未作答）/);
  assert.doesNotMatch(unpublished, /批改结果|答对|答错|部分得分/);
  assert.equal(publishedReceiptOutcome(), "PENDING");
  assert.equal(
    publishedReceiptOutcome({ score: 2, maxScore: 5, gradingStatus: "GRADED" }),
    "PARTIAL",
  );
});

test("教师试卷答题卡合并交错题型并保留原题号，预览无个人进度", () => {
  const html = renderToStaticMarkup(
    React.createElement(AnswerSheetPanel, {
      questions: [
        { id: "one", sortOrder: 1, type: "SINGLE_CHOICE" },
        { id: "two", sortOrder: 2, type: "SHORT_ANSWER" },
        { id: "three", sortOrder: 3, type: "SINGLE_CHOICE" },
      ],
      totalQuestionCount: 5,
      totalPoints: 100,
      activeIndex: -1,
      groupByType: "type",
      legendItems: [],
      onSelect: () => undefined,
    }),
  );
  assert.match(html, /单选题 · 2 题/);
  assert.ok(html.includes("显示 3 / 5 题"));
  assert.doesNotMatch(html, /已完成|0%/);
  assert.deepEqual(
    [...html.matchAll(/aria-label="第 (\d+) 题/g)].map((m) => m[1]),
    ["1", "3", "2"],
  );
});
