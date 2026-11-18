import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AnswerSheetPanel,
  type AnswerSheetQuestion,
} from "../../components/assignments/answer-sheet-panel";

test("answer card separates adjacent types without reordering an interleaved paper", () => {
  Object.assign(globalThis, { React });
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
  assert.match(html, /aria-current="step" aria-label="第 3 题（未作答）"/);
  assert.match(html, /aria-label="第 1 题（已作答）"/);
});
