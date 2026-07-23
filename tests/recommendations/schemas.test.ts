import assert from "node:assert/strict";
import test from "node:test";

import { QuestionType } from "@prisma/client";

import {
  recommendationGenerationApiSchema,
  recommendationListQuerySchema,
  recommendationPracticeSubmitSchema,
  recommendationRequestSchema,
} from "../../services/recommendations/schemas";

test("request schema applies defaults and removes duplicate scope values", () => {
  const parsed = recommendationRequestSchema.parse({
    studentId: "student-1",
    classroomId: "classroom-1",
    recommendedDifficulty: 3,
    teacherScope: {
      candidateQuestionIds: ["question-1", "question-1"],
      types: [QuestionType.FILL_BLANK, QuestionType.FILL_BLANK],
      tags: ["algebra", "algebra"],
    },
  });

  assert.equal(parsed.count, 10);
  assert.deepEqual(parsed.teacherScope.candidateQuestionIds, ["question-1"]);
  assert.deepEqual(parsed.teacherScope.knowledgePointIds, []);
  assert.deepEqual(parsed.teacherScope.types, [QuestionType.FILL_BLANK]);
  assert.deepEqual(parsed.teacherScope.tags, ["algebra"]);
});

test("request schema rejects invalid difficulty, count and empty candidate pool", () => {
  assert.equal(
    recommendationRequestSchema.safeParse({
      studentId: "student-1",
      classroomId: "classroom-1",
      recommendedDifficulty: 6,
      count: 0,
      teacherScope: { candidateQuestionIds: [] },
    }).success,
    false,
  );
});

test("API generation schema maps safe defaults and rejects invalid limits", () => {
  const parsed = recommendationGenerationApiSchema.parse({
    studentId: "student-1",
  });
  assert.equal(parsed.limit, 10);
  assert.equal(parsed.recommendedDifficulty, 3);
  assert.equal(
    recommendationGenerationApiSchema.safeParse({
      studentId: "student-1",
      limit: 0,
    }).success,
    false,
  );
  assert.equal(
    recommendationGenerationApiSchema.safeParse({
      studentId: "student-1",
      limit: 51,
    }).success,
    false,
  );
});

test("list query schema coerces pagination input and validates status", () => {
  const parsed = recommendationListQuerySchema.parse({ limit: "5" });
  assert.equal(parsed.limit, 5);
  assert.equal(
    recommendationListQuerySchema.safeParse({ status: "UNKNOWN" }).success,
    false,
  );
});

test("practice submission validates idempotency and rejects duplicate questions", () => {
  const valid = {
    idempotencyKey: "b4c870f0-0652-42f3-b24e-6fd159ea43ad",
    answers: [
      {
        questionId: "question-1",
        kind: "CHOICE",
        optionIds: ["option-1"],
        responseTimeMs: 1000,
      },
    ],
  };
  assert.equal(
    recommendationPracticeSubmitSchema.safeParse(valid).success,
    true,
  );
  assert.equal(
    recommendationPracticeSubmitSchema.safeParse({
      ...valid,
      answers: [...valid.answers, { ...valid.answers[0] }],
    }).success,
    false,
  );
  assert.equal(
    recommendationPracticeSubmitSchema.safeParse({
      ...valid,
      score: 100,
      isCorrect: true,
    }).success,
    false,
  );
});

test("practice submission rejects empty answers and duplicate options", () => {
  const base = {
    idempotencyKey: "b4c870f0-0652-42f3-b24e-6fd159ea43ad",
    answers: [
      {
        questionId: "question-1",
        kind: "CHOICE",
        optionIds: [] as string[],
      },
    ],
  };
  assert.equal(
    recommendationPracticeSubmitSchema.safeParse(base).success,
    false,
  );
  assert.equal(
    recommendationPracticeSubmitSchema.safeParse({
      ...base,
      answers: [{ ...base.answers[0], optionIds: ["option-1", "option-1"] }],
    }).success,
    false,
  );
});
