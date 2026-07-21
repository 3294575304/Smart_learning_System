import assert from "node:assert/strict";
import test from "node:test";

import { QuestionType } from "@prisma/client";

import {
  enhanceRecommendationReasons,
  type RecommendationExplanationInput,
  type RecommendationExplanationProvider,
} from "../../services/ai/recommender";
import type { RecommendationItem } from "../../services/recommendations/types";

function item(questionId: string): RecommendationItem {
  return {
    rank: 1,
    questionId,
    title: "一元一次方程",
    type: QuestionType.FILL_BLANK,
    difficulty: 2,
    score: 70,
    primaryKnowledgePointId: "kp-1",
    matchedKnowledgePoints: [
      { id: "kp-1", name: "一元一次方程", masteryScore: 40 },
    ],
    reasonCodes: ["WEAK_KNOWLEDGE_POINT", "DIFFICULTY_MATCH"],
    reason: "规则推荐原因。",
  };
}

test("AI may replace reasons only for already-selected questions", async () => {
  let attempts = 0;
  const provider: RecommendationExplanationProvider = {
    async generateRecommendationReasons(
      _input: RecommendationExplanationInput,
      options,
    ) {
      attempts += 1;
      if (attempts === 1) {
        return { items: [{ questionId: "unknown", reason: "越权题目" }] };
      }
      assert.ok(options.validationError);
      return {
        items: [{ questionId: "question-1", reason: "AI 润色后的说明。" }],
      };
    },
  };

  const result = await enhanceRecommendationReasons(
    provider,
    [item("question-1")],
    1_000,
  );
  assert.equal(result.enhanced, true);
  assert.equal(result.retryCount, 1);
  assert.equal(result.items[0].questionId, "question-1");
  assert.equal(result.items[0].reason, "AI 润色后的说明。");
});

test("invalid AI output falls back to the complete rule result", async () => {
  const original = item("question-1");
  const provider: RecommendationExplanationProvider = {
    async generateRecommendationReasons() {
      return { items: [{ questionId: "unknown", reason: "越权题目" }] };
    },
  };

  const result = await enhanceRecommendationReasons(
    provider,
    [original],
    1_000,
  );
  assert.equal(result.enhanced, false);
  assert.equal(result.errorCode, "INVALID_PROVIDER_OUTPUT");
  assert.deepEqual(result.items, [original]);
});
