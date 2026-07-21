import assert from "node:assert/strict";
import test from "node:test";

import {
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
} from "@prisma/client";

import { recommendQuestions } from "../../services/recommendations/algorithm";
import type {
  RecommendationAlgorithmInput,
  RecommendationCandidate,
} from "../../services/recommendations/types";

function candidate(
  id: string,
  overrides: Partial<RecommendationCandidate> = {},
): RecommendationCandidate {
  return {
    id,
    creatorId: "teacher-1",
    title: `题目 ${id}`,
    type: QuestionType.SINGLE_CHOICE,
    difficulty: 2,
    visibility: QuestionVisibility.PRIVATE,
    status: QuestionStatus.ACTIVE,
    deletedAt: null,
    tags: ["algebra"],
    knowledgePoints: [{ id: "kp-weak", name: "一元一次方程", isActive: true }],
    ...overrides,
  };
}

function algorithmInput(
  candidates: RecommendationCandidate[],
  overrides: Partial<RecommendationAlgorithmInput> = {},
): RecommendationAlgorithmInput {
  return {
    studentId: "student-1",
    weakKnowledgePoints: [{ knowledgePointId: "kp-weak", severity: 4 }],
    knowledgeMasteries: [{ knowledgePointId: "kp-weak", masteryScore: 30 }],
    recentCompletedQuestionIds: [],
    activeRecommendationQuestionIds: [],
    recentErrorTypes: ["CONCEPT"],
    recommendedDifficulty: 2,
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    teacherScope: {
      teacherId: "teacher-1",
      candidateQuestionIds: candidates.map((item) => item.id),
      knowledgePointIds: [],
      types: [],
      tags: [],
    },
    candidates,
    limit: 10,
    ...overrides,
  };
}

test("hard filters remove unavailable, unauthorized, recent, duplicate and difficulty-mismatched questions", () => {
  const valid = candidate("valid");
  const input = algorithmInput(
    [
      valid,
      valid,
      candidate("inactive", { status: QuestionStatus.INACTIVE }),
      candidate("deleted", { deletedAt: new Date() }),
      candidate("private-other", { creatorId: "teacher-2" }),
      candidate("recent"),
      candidate("active-recommendation"),
      candidate("too-hard", { difficulty: 4 }),
      candidate("outside-scope"),
    ],
    {
      recentCompletedQuestionIds: ["recent"],
      activeRecommendationQuestionIds: ["active-recommendation"],
      teacherScope: {
        teacherId: "teacher-1",
        candidateQuestionIds: [
          "valid",
          "inactive",
          "deleted",
          "private-other",
          "recent",
          "active-recommendation",
          "too-hard",
        ],
        knowledgePointIds: [],
        types: [],
        tags: [],
      },
    },
  );

  const result = recommendQuestions(input);
  assert.deepEqual(
    result.items.map((item) => item.questionId),
    ["valid"],
  );
  assert.equal(result.metadata.excludedCounts.DUPLICATE_CANDIDATE, 1);
  assert.equal(result.metadata.excludedCounts.UNAVAILABLE, 2);
  assert.equal(result.metadata.excludedCounts.UNAUTHORIZED, 1);
  assert.equal(result.metadata.excludedCounts.RECENTLY_COMPLETED, 1);
  assert.equal(result.metadata.excludedCounts.ALREADY_RECOMMENDED, 1);
  assert.equal(result.metadata.excludedCounts.DIFFICULTY_MISMATCH, 1);
  assert.equal(result.metadata.excludedCounts.OUTSIDE_TEACHER_SCOPE, 1);
});

test("weak knowledge point and mastery deficit determine priority and explain the result", () => {
  const weakQuestion = candidate("weak");
  const supplementalQuestion = candidate("supplemental", {
    knowledgePoints: [{ id: "kp-strong", name: "整数运算", isActive: true }],
  });
  const result = recommendQuestions(
    algorithmInput([supplementalQuestion, weakQuestion], { limit: 1 }),
  );

  assert.equal(result.items[0].questionId, "weak");
  assert.ok(result.items[0].reason.includes("掌握度 30%"));
  assert.ok(result.items[0].reason.includes("概念理解"));
  assert.ok(result.items[0].reasonCodes.includes("WEAK_KNOWLEDGE_POINT"));
});

test("selection contains multiple question types when the candidate pool permits it", () => {
  const result = recommendQuestions(
    algorithmInput(
      [
        candidate("choice-1"),
        candidate("choice-2"),
        candidate("blank", {
          type: QuestionType.FILL_BLANK,
          knowledgePoints: [
            { id: "kp-strong", name: "整数运算", isActive: true },
          ],
        }),
      ],
      { limit: 2 },
    ),
  );

  assert.equal(new Set(result.items.map((item) => item.type)).size, 2);
});

test("teacher knowledge-point, type and tag scope is an intersection", () => {
  const valid = candidate("valid-scope", {
    type: QuestionType.FILL_BLANK,
    tags: ["target-tag"],
  });
  const wrongType = candidate("wrong-type", { tags: ["target-tag"] });
  const wrongTag = candidate("wrong-tag", {
    type: QuestionType.FILL_BLANK,
    tags: ["other-tag"],
  });
  const wrongKnowledgePoint = candidate("wrong-kp", {
    type: QuestionType.FILL_BLANK,
    tags: ["target-tag"],
    knowledgePoints: [{ id: "kp-other", name: "其他知识点", isActive: true }],
  });
  const candidates = [valid, wrongType, wrongTag, wrongKnowledgePoint];
  const result = recommendQuestions(
    algorithmInput(candidates, {
      teacherScope: {
        teacherId: "teacher-1",
        candidateQuestionIds: candidates.map((item) => item.id),
        knowledgePointIds: ["kp-weak"],
        types: [QuestionType.FILL_BLANK],
        tags: ["target-tag"],
      },
    }),
  );

  assert.deepEqual(
    result.items.map((item) => item.questionId),
    ["valid-scope"],
  );
  assert.equal(result.metadata.excludedCounts.OUTSIDE_TEACHER_SCOPE, 3);
});

test("a wrong streak reserves the first positions for foundation questions", () => {
  const result = recommendQuestions(
    algorithmInput(
      [
        candidate("target", { difficulty: 3 }),
        candidate("foundation", {
          difficulty: 2,
          knowledgePoints: [
            { id: "kp-strong", name: "整数运算", isActive: true },
          ],
        }),
      ],
      {
        recommendedDifficulty: 3,
        consecutiveWrong: 4,
        limit: 2,
      },
    ),
  );

  assert.equal(result.items[0].questionId, "foundation");
  assert.ok(
    result.items[0].reasonCodes.includes("FOUNDATION_AFTER_WRONG_STREAK"),
  );
});

test("a correct streak adds only a small advanced-question allocation", () => {
  const candidates = [
    candidate("core-1"),
    candidate("core-2", { type: QuestionType.TRUE_FALSE }),
    candidate("core-3"),
    candidate("core-4", { type: QuestionType.FILL_BLANK }),
    candidate("advanced-1", { difficulty: 3 }),
    candidate("advanced-2", { difficulty: 3 }),
    candidate("advanced-3", { difficulty: 3 }),
  ];
  const result = recommendQuestions(
    algorithmInput(candidates, {
      consecutiveCorrect: 5,
      limit: 5,
    }),
  );

  assert.equal(result.items.filter((item) => item.difficulty === 3).length, 1);
  assert.ok(
    result.items.some((item) =>
      item.reasonCodes.includes("ADVANCED_AFTER_CORRECT_STREAK"),
    ),
  );
});

test("recommendations are deterministic for equal inputs", () => {
  const input = algorithmInput([
    candidate("b"),
    candidate("a"),
    candidate("c", { type: QuestionType.TRUE_FALSE }),
  ]);
  assert.deepEqual(recommendQuestions(input), recommendQuestions(input));
});
