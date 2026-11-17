import assert from "node:assert/strict";
import test from "node:test";
import { QuestionType } from "@prisma/client";
import {
  applyExamTypeSubtotals,
  DEFAULT_EXAM_TYPE_WEIGHTS,
  distributeExamPoints,
  sumExamPointsByType,
} from "@/services/exams/auto-assembly-scoring";
import {
  distributeEvenPoints,
  distributeEvenPointsByType,
} from "@/services/questions/score-distribution";
import { organizeQuestionsByType } from "@/services/questions/question-order";

const cents = (value: number) => Math.round(value * 100);

test("按题型权重配分支持自定义目标总分", () => {
  const questions = [
    { id: "a", type: QuestionType.SINGLE_CHOICE },
    { id: "b", type: QuestionType.MULTIPLE_CHOICE },
    { id: "c", type: QuestionType.PYTHON_PROGRAMMING },
  ];
  const scored = distributeExamPoints(
    questions,
    DEFAULT_EXAM_TYPE_WEIGHTS,
    120,
  );
  assert.equal(
    scored.reduce((sum, item) => sum + cents(item.points), 0),
    12000,
  );
  // 不传目标总分时保持旧的 100 分行为
  const legacy = distributeExamPoints(questions, DEFAULT_EXAM_TYPE_WEIGHTS);
  assert.equal(
    legacy.reduce((sum, item) => sum + cents(item.points), 0),
    10000,
  );
});

test("全卷均分：合计等于目标，且每题误差不超过 0.01", () => {
  const points = distributeEvenPoints(7, 100);
  assert.equal(
    points.reduce((sum, value) => sum + cents(value), 0),
    10000,
  );
  assert.ok(Math.max(...points) - Math.min(...points) <= 0.01);
});

test("自定义题型小计平分到各题并保留两位小数", () => {
  const questions = [
    { id: "a", type: QuestionType.TRUE_FALSE, points: 1 },
    { id: "b", type: QuestionType.PYTHON_PROGRAMMING, points: 1 },
    { id: "c", type: QuestionType.PYTHON_PROGRAMMING, points: 1 },
    { id: "d", type: QuestionType.PYTHON_PROGRAMMING, points: 1 },
  ];
  const subtotals = { TRUE_FALSE: 90, PYTHON_PROGRAMMING: 10 };
  const scored = applyExamTypeSubtotals(questions, subtotals);
  assert.deepEqual(
    scored.map(({ points }) => points),
    [90, 3.34, 3.33, 3.33],
  );
  assert.deepEqual(sumExamPointsByType(scored), subtotals);
  const extra = { id: "e", type: QuestionType.PYTHON_PROGRAMMING, points: 1 };
  const edited = applyExamTypeSubtotals([...questions, extra], subtotals);
  assert.deepEqual(
    edited.map(({ points }) => points),
    [90, 2.5, 2.5, 2.5, 2.5],
  );
  assert.deepEqual(sumExamPointsByType(edited.slice(1)), {
    PYTHON_PROGRAMMING: 10,
  });
});

test("未配分的新题型和小计不足的题型留待重新分配", () => {
  const questions = [
    { type: QuestionType.TRUE_FALSE, points: 5 },
    { type: QuestionType.TRUE_FALSE, points: 5 },
    { type: QuestionType.SINGLE_CHOICE, points: 5 },
    { type: QuestionType.PYTHON_PROGRAMMING, points: 5 },
  ];
  const points = applyExamTypeSubtotals(questions, {
    TRUE_FALSE: 0.01,
    PYTHON_PROGRAMMING: 60,
  });
  assert.deepEqual(
    points.map(({ points }) => points),
    [0, 0, 0, 60],
  );
  assert.ok(
    applyExamTypeSubtotals(
      Array.from({ length: 201 }, () => questions[0]),
      { TRUE_FALSE: 100 },
    ).every(({ points }) => points === 0),
  );
});

test("按题型均分：各题型小计相同，题型内再均分", () => {
  const questions = [
    { id: "a1", type: "SINGLE_CHOICE", points: 0 },
    { id: "a2", type: "SINGLE_CHOICE", points: 0 },
    { id: "b1", type: "SHORT_ANSWER", points: 0 },
  ];
  const points = distributeEvenPointsByType(questions, 120);
  assert.equal(
    points.reduce((sum, value) => sum + cents(value), 0),
    12000,
  );
  const choiceSubtotal = cents(points[0]) + cents(points[1]);
  const shortSubtotal = cents(points[2]);
  assert.equal(choiceSubtotal, shortSubtotal);
});

test("目标总分不足以覆盖每题 0.01 分时抛出可读错误", () => {
  assert.throws(() => distributeEvenPoints(10, 0.05), /每题至少0.01分/);
});

test("按题型整理：题型顺序固定，同题型内保持原相对顺序", () => {
  const questions = [
    { id: "s2", type: QuestionType.SHORT_ANSWER },
    { id: "c1", type: QuestionType.SINGLE_CHOICE },
    { id: "p1", type: QuestionType.PYTHON_PROGRAMMING },
    { id: "c2", type: QuestionType.SINGLE_CHOICE },
    { id: "t1", type: QuestionType.TRUE_FALSE },
  ];
  const ordered = organizeQuestionsByType(questions);
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["c1", "c2", "t1", "p1", "s2"],
  );
});
