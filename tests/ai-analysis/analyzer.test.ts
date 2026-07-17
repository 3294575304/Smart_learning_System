import assert from "node:assert/strict";
import test from "node:test";

import { analyzeStudentPerformance } from "../../services/ai/analyzer";
import { MockAIProvider } from "../../services/ai/mock-provider";
import type { AIProvider } from "../../services/ai/provider";
import { analysisInputFixture } from "./fixtures";

const validOutput = {
  overallLevel: "BASIC" as const,
  masteredKnowledgePoints: [],
  weakKnowledgePoints: [
    { knowledgePointId: "kp-algebra", severity: 4, reason: "连续答错。" },
  ],
  errorPatterns: [{ type: "CONCEPT" as const, evidence: "移项符号错误。" }],
  suggestions: ["复习等式性质。"],
  recommendedDifficulty: 2,
  confidence: 0.7,
};

test("invalid JSON is retried once and a valid second output is accepted", async () => {
  let calls = 0;
  const provider = new MockAIProvider((_input, options) => {
    calls += 1;
    if (calls === 1) return "not-json";
    assert.ok(options.validationError);
    return JSON.stringify(validOutput);
  });
  const result = await analyzeStudentPerformance(
    provider,
    analysisInputFixture,
  );
  assert.equal(calls, 2);
  assert.equal(result.retryCount, 1);
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.output, validOutput);
});

test("two invalid outputs produce a rule-based fallback", async () => {
  let calls = 0;
  const provider = new MockAIProvider(() => {
    calls += 1;
    return { unexpected: true };
  });
  const result = await analyzeStudentPerformance(
    provider,
    analysisInputFixture,
  );
  assert.equal(calls, 2);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, "INVALID_PROVIDER_OUTPUT");
  assert.equal(result.output.overallLevel, "BEGINNER");
});

test("hallucinated knowledge point ids are rejected and fall back", async () => {
  const provider = new MockAIProvider(() => ({
    ...validOutput,
    weakKnowledgePoints: [
      { knowledgePointId: "invented-kp", severity: 3, reason: "无依据" },
    ],
  }));
  const result = await analyzeStudentPerformance(
    provider,
    analysisInputFixture,
  );
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, "INVALID_PROVIDER_OUTPUT");
});

test("provider timeouts are retried once and then fall back", async () => {
  let calls = 0;
  const provider: AIProvider = {
    name: "timeout-test",
    model: "timeout-model",
    analyzeStudentPerformance: () => {
      calls += 1;
      return new Promise(() => undefined);
    },
  };
  const result = await analyzeStudentPerformance(
    provider,
    analysisInputFixture,
    5,
  );
  assert.equal(calls, 2);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, "PROVIDER_TIMEOUT");
});
