import assert from "node:assert/strict";
import test from "node:test";
import { GradingStatus, QuestionType } from "@prisma/client";

import {
  gradeAnswer,
  normalizeFillBlank,
} from "../../services/assignments/grading";

test("multiple-choice grading compares sets instead of answer order", () => {
  const result = gradeAnswer(
    {
      type: QuestionType.MULTIPLE_CHOICE,
      points: 8,
      correctBoolean: null,
      acceptableAnswers: [],
      isCaseSensitive: false,
      options: [
        { id: "a", isCorrect: true },
        { id: "b", isCorrect: true },
        { id: "c", isCorrect: false },
      ],
    },
    {
      assignmentQuestionId: "q",
      kind: "CHOICE",
      optionIds: ["b", "a"],
    },
  );
  assert.deepEqual(result, {
    gradingStatus: GradingStatus.AUTO_GRADED,
    score: 8,
    isCorrect: true,
  });
});

test("fill-blank normalization ignores surrounding/repeated spaces and case", () => {
  assert.equal(normalizeFillBlank("  OpenAI   GPT  ", false), "openai gpt");
  const result = gradeAnswer(
    {
      type: QuestionType.FILL_BLANK,
      points: 5,
      correctBoolean: null,
      acceptableAnswers: ["OpenAI GPT"],
      isCaseSensitive: false,
      options: [],
    },
    {
      assignmentQuestionId: "q",
      kind: "TEXT",
      value: "  openai    gpt ",
    },
  );
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 5);
});

test("case-sensitive fill blanks retain letter case", () => {
  const result = gradeAnswer(
    {
      type: QuestionType.FILL_BLANK,
      points: 5,
      correctBoolean: null,
      acceptableAnswers: ["GPT"],
      isCaseSensitive: true,
      options: [],
    },
    { assignmentQuestionId: "q", kind: "TEXT", value: "gpt" },
  );
  assert.equal(result.isCorrect, false);
});

test("short answers are explicitly queued for manual review", () => {
  const result = gradeAnswer(
    {
      type: QuestionType.SHORT_ANSWER,
      points: 10,
      correctBoolean: null,
      acceptableAnswers: [],
      isCaseSensitive: false,
      options: [],
    },
    { assignmentQuestionId: "q", kind: "TEXT", value: "proof" },
  );
  assert.equal(result.gradingStatus, GradingStatus.MANUAL_REVIEW_REQUIRED);
  assert.equal(result.score, null);
});
