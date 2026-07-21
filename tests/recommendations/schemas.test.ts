import assert from "node:assert/strict";
import test from "node:test";

import { QuestionType } from "@prisma/client";

import { recommendationRequestSchema } from "../../services/recommendations/schemas";

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
