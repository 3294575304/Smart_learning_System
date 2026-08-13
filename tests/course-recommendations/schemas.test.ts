import assert from "node:assert/strict";
import test from "node:test";

import { QuestionType } from "@prisma/client";

import {
  courseRecommendationGenerationSchema,
  courseTeachingProgressSchema,
} from "../../services/course-recommendations/schemas";

test("teaching progress requires a current graph and de-duplicates concepts", () => {
  const parsed = courseTeachingProgressSchema.parse({
    graphVersionId: "graph-1",
    expectedRevision: 0,
    conceptIds: ["concept-1", "concept-1", "concept-2"],
    note: "第一阶段",
  });
  assert.deepEqual(parsed.conceptIds, ["concept-1", "concept-2"]);
  assert.equal(
    courseTeachingProgressSchema.safeParse({
      graphVersionId: "graph-1",
      expectedRevision: 0,
      conceptIds: [],
    }).success,
    false,
  );
});

test("course recommendation conditions are bounded and only accept supported practice types", () => {
  const parsed = courseRecommendationGenerationSchema.parse({
    classroomId: "classroom-1",
    conceptIds: ["concept-1", "concept-1"],
    questionTypes: [QuestionType.FILL_BLANK, QuestionType.FILL_BLANK],
  });
  assert.deepEqual(parsed.conceptIds, ["concept-1"]);
  assert.deepEqual(parsed.questionTypes, [QuestionType.FILL_BLANK]);
  assert.equal(parsed.count, 10);
  assert.equal(parsed.difficulty, 3);
  assert.equal(
    courseRecommendationGenerationSchema.safeParse({
      classroomId: "classroom-1",
      questionTypes: [QuestionType.PYTHON_PROGRAMMING],
    }).success,
    true,
  );
  assert.equal(
    courseRecommendationGenerationSchema.safeParse({
      classroomId: "classroom-1",
      count: 21,
    }).success,
    false,
  );
});
