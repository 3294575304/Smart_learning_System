import assert from "node:assert/strict";
import test from "node:test";
import { QuestionType } from "@prisma/client";
import {
  DEFAULT_EXAM_TYPE_WEIGHTS,
  distributeExamPoints,
} from "@/services/exams/auto-assembly-scoring";
import { examAutoAssembleSchema } from "@/services/exams/schemas";
import { selectExamAssemblyCandidates } from "@/services/exams/auto-assembly-selection";
import { questionGenerationRequestSchema } from "@/services/ai-question-generation/schemas";
import { toggleChapterConcepts } from "@/services/exams/concept-selection";

test("题型权重换算后恰好为 100 分，并保持题序", () => {
  const questions = [
    { id: "a", type: QuestionType.SINGLE_CHOICE },
    { id: "b", type: QuestionType.SINGLE_CHOICE },
    { id: "c", type: QuestionType.MULTIPLE_CHOICE },
    { id: "d", type: QuestionType.PYTHON_PROGRAMMING },
  ];
  const scored = distributeExamPoints(questions, DEFAULT_EXAM_TYPE_WEIGHTS);
  assert.deepEqual(
    scored.map((item) => item.id),
    ["a", "b", "c", "d"],
  );
  assert.equal(
    scored.reduce((sum, item) => sum + Math.round(item.points * 100), 0),
    10000,
  );
  assert.ok(scored[3].points > scored[2].points);
  assert.ok(scored[2].points > scored[0].points);
});

test("自动组卷请求拒绝重复知识点和超额题量", () => {
  const valid = {
    courseId: "ck1234567890123456789012345",
    startsAt: new Date("2026-12-01T00:00:00Z"),
    conceptIds: ["ck1234567890123456789012346"],
    counts: { SINGLE_CHOICE: 3 },
    excludeQuestionIds: [],
  };
  assert.equal(examAutoAssembleSchema.safeParse(valid).success, true);
  assert.equal(
    examAutoAssembleSchema.safeParse({
      ...valid,
      conceptIds: [...valid.conceptIds, ...valid.conceptIds],
    }).success,
    false,
  );
  assert.equal(
    examAutoAssembleSchema.safeParse({
      ...valid,
      counts: { SINGLE_CHOICE: 201 },
    }).success,
    false,
  );
});

test("多知识点选题优先均衡覆盖，排除已选内容并报告缺口", () => {
  const candidates = [
    {
      id: "a",
      title: "A",
      type: QuestionType.SINGLE_CHOICE,
      hash: "a",
      conceptIds: ["one"],
    },
    {
      id: "b",
      title: "B",
      type: QuestionType.SINGLE_CHOICE,
      hash: "b",
      conceptIds: ["two"],
    },
    {
      id: "c",
      title: "C",
      type: QuestionType.SINGLE_CHOICE,
      hash: "a",
      conceptIds: ["two"],
    },
    {
      id: "d",
      title: "D",
      type: QuestionType.MULTIPLE_CHOICE,
      hash: "d",
      conceptIds: ["one"],
    },
  ];
  const result = selectExamAssemblyCandidates(
    candidates,
    ["one", "two"],
    {
      SINGLE_CHOICE: 3,
      MULTIPLE_CHOICE: 1,
    },
    new Set(["a"]),
  );
  assert.deepEqual(
    result.selected.map((item) => item.id),
    ["b", "d"],
  );
  assert.deepEqual(result.shortages, [
    { type: QuestionType.SINGLE_CHOICE, requested: 3, found: 1 },
  ]);
  assert.deepEqual(result.coverage, { one: 1, two: 1 });
});

test("考试 AI 出题请求保留知识点均衡标记与题型上限", () => {
  const base = {
    courseId: "ck1234567890123456789012345",
    mode: "RANGE",
    chapterCode: null,
    conceptIds: ["ck1234567890123456789012346"],
    balancedConcepts: true,
    sourceQuestionId: null,
    bloomLevel: "APPLY",
    objectiveCode: null,
    counts: { SINGLE_CHOICE: 10 },
    singleChoiceOptions: 4,
    multipleChoiceOptions: 4,
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
  };
  assert.equal(
    questionGenerationRequestSchema.parse(base).balancedConcepts,
    true,
  );
  assert.equal(
    questionGenerationRequestSchema.safeParse({
      ...base,
      counts: { SINGLE_CHOICE: 11 },
    }).success,
    false,
  );
});

test("整章勾选补齐部分选择、再次点击取消整章，超限时不部分勾选", () => {
  assert.deepEqual(toggleChapterConcepts(["a", "outside"], ["a", "b"], 20), {
    ids: ["a", "outside", "b"],
    exceeded: false,
  });
  assert.deepEqual(
    toggleChapterConcepts(["a", "b", "outside"], ["a", "b"], 20),
    {
      ids: ["outside"],
      exceeded: false,
    },
  );
  assert.deepEqual(
    toggleChapterConcepts(["a", "outside"], ["a", "b", "c"], 3),
    {
      ids: ["a", "outside"],
      exceeded: true,
    },
  );
});
