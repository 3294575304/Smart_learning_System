import assert from "node:assert/strict";
import test from "node:test";

import { QuestionStatus, QuestionType } from "@prisma/client";

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
    title: `题目 ${id}`,
    type: QuestionType.SINGLE_CHOICE,
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

test("hard filters remove unavailable, recent and duplicate questions without difficulty filtering", () => {
  const valid = candidate("valid");
  const input = algorithmInput(
    [
      valid,
      valid,
      candidate("inactive", { status: QuestionStatus.INACTIVE }),
      candidate("deleted", { deletedAt: new Date() }),
      candidate("recent"),
      candidate("active-recommendation"),
      candidate("too-hard"),
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
    ["too-hard", "valid"],
  );
  assert.equal(result.metadata.excludedCounts.DUPLICATE_CANDIDATE, 1);
  assert.equal(result.metadata.excludedCounts.UNAVAILABLE, 2);
  assert.equal(result.metadata.excludedCounts.UNAUTHORIZED, 0);
  assert.equal(result.metadata.excludedCounts.RECENTLY_COMPLETED, 1);
  assert.equal(result.metadata.excludedCounts.ALREADY_RECOMMENDED, 1);
  assert.equal(result.metadata.excludedCounts.DIFFICULTY_MISMATCH, 0);
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

test("a wrong streak prioritizes weak knowledge evidence regardless of difficulty", () => {
  const result = recommendQuestions(
    algorithmInput(
      [
        candidate("target"),
        candidate("foundation", {
          knowledgePoints: [
            { id: "kp-strong", name: "整数运算", isActive: true },
          ],
        }),
      ],
      {
        consecutiveWrong: 4,
        limit: 2,
      },
    ),
  );

  assert.equal(result.items[0].questionId, "target");
  assert.ok(
    result.items[0].reasonCodes.includes("FOUNDATION_AFTER_WRONG_STREAK"),
  );
});

test("a correct streak does not allocate questions by difficulty", () => {
  const candidates = [
    candidate("core-1"),
    candidate("core-2", { type: QuestionType.TRUE_FALSE }),
    candidate("core-3"),
    candidate("core-4", { type: QuestionType.FILL_BLANK }),
    candidate("advanced-1"),
    candidate("advanced-2"),
    candidate("advanced-3"),
  ];
  const result = recommendQuestions(
    algorithmInput(candidates, {
      consecutiveCorrect: 5,
      limit: 5,
    }),
  );

  assert.equal(result.items.length, 5);
  assert.ok(
    result.items.every(
      (item) => !item.reasonCodes.includes("ADVANCED_AFTER_CORRECT_STREAK"),
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
