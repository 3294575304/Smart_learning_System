import assert from "node:assert/strict";
import test from "node:test";

import {
  QuestionType,
  RecommendationSource,
  RecommendationStatus,
} from "@prisma/client";

import {
  recommendationPracticePath,
  runGenerateRecommendations,
  runStartRecommendation,
} from "../../components/recommendations/recommendation-actions";

const listItem = {
  id: "recommendation-1",
  questionId: "question-1",
  title: "一元一次方程",
  content: "计算题目",
  type: QuestionType.FILL_BLANK,
  difficulty: 3,
  knowledgePoints: [{ id: "kp-1", name: "方程" }],
  reason: "巩固薄弱知识点",
  status: RecommendationStatus.PENDING,
  createdAt: "2026-07-21T08:00:00.000Z",
  expiresAt: null,
};

const generation = {
  cycleKey: "cycle-1",
  studentId: "student-1",
  targetDifficulty: 3,
  source: RecommendationSource.RULE,
  generatedAt: "2026-07-21T08:00:00.000Z",
  items: [listItem],
  metadata: {
    requestedCount: 10,
    returnedCount: 1,
    excludedCounts: {
      DUPLICATE_CANDIDATE: 0,
      UNAVAILABLE: 0,
      UNAUTHORIZED: 0,
      OUTSIDE_TEACHER_SCOPE: 0,
      RECENTLY_COMPLETED: 0,
      ALREADY_RECOMMENDED: 0,
      DIFFICULTY_MISMATCH: 0,
    },
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    representedTypes: [QuestionType.FILL_BLANK],
    relaxedConstraints: [],
  },
};

test("successful generation refreshes the server-rendered list", async () => {
  let receivedStudentId = "";
  let refreshCount = 0;
  const feedback = await runGenerateRecommendations(
    {
      studentId: "student-1",
      classroomId: "classroom-1",
      recommendedDifficulty: 3,
      limit: 10,
    },
    {
      generate: async (input) => {
        receivedStudentId = input.studentId;
        return { success: true, data: generation };
      },
      refresh: () => {
        refreshCount += 1;
      },
    },
  );

  assert.equal(receivedStudentId, "student-1");
  assert.equal(refreshCount, 1);
  assert.deepEqual(feedback, {
    kind: "success",
    message: "已生成 1 道推荐练习。",
  });
});

test("failed generation displays a safe empty-data message without refreshing", async () => {
  let refreshCount = 0;
  const feedback = await runGenerateRecommendations(
    { studentId: "student-1", recommendedDifficulty: 3, limit: 10 },
    {
      generate: async () => ({
        success: false,
        error: "当前没有可用于推荐的题目",
        status: 422,
      }),
      refresh: () => {
        refreshCount += 1;
      },
    },
  );

  assert.equal(refreshCount, 0);
  assert.equal(feedback.kind, "error");
  assert.match(feedback.message, /没有足够的数据或可用题目/u);
});

test("starting a recommendation updates state before navigating to practice", async () => {
  const events: string[] = [];
  const feedback = await runStartRecommendation("recommendation-1", {
    start: async (recommendationId) => {
      events.push(`start:${recommendationId}`);
      return {
        success: true,
        data: {
          ...listItem,
          status: RecommendationStatus.STARTED,
          options: [],
          startedAt: "2026-07-21T08:10:00.000Z",
        },
      };
    },
    navigate: (path) => events.push(`navigate:${path}`),
    refresh: () => events.push("refresh"),
  });

  assert.equal(feedback.kind, "success");
  assert.deepEqual(events, [
    "start:recommendation-1",
    `navigate:${recommendationPracticePath("recommendation-1")}`,
    "refresh",
  ]);
});

test("start conflicts remain on the current page with a clear message", async () => {
  let navigated = false;
  const feedback = await runStartRecommendation("expired-1", {
    start: async () => ({
      success: false,
      error: "raw conflict",
      status: 409,
    }),
    navigate: () => {
      navigated = true;
    },
    refresh: () => undefined,
  });

  assert.equal(navigated, false);
  assert.equal(feedback.kind, "error");
  assert.match(feedback.message, /已失效或状态发生变化/u);
});
