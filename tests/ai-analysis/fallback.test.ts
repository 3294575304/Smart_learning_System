import assert from "node:assert/strict";
import test from "node:test";

import { generateRuleBasedAnalysis } from "../../services/ai/fallback";
import { analysisInputFixture } from "./fixtures";

test("rule fallback derives levels, weaknesses and bounded difficulty", () => {
  const result = generateRuleBasedAnalysis(analysisInputFixture);
  assert.equal(result.overallLevel, "BEGINNER");
  assert.equal(result.recommendedDifficulty, 2);
  assert.deepEqual(result.weakKnowledgePoints, [
    {
      knowledgePointId: "kp-algebra",
      severity: 5,
      reason: "该知识点正确率为 0%（0/1），需要巩固。",
    },
  ]);
  assert.equal(result.errorPatterns[0]?.type, "UNKNOWN");
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
});
