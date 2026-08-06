import assert from "node:assert/strict";
import test from "node:test";

import { AIEnhancementStatus } from "@prisma/client";
import type { AIProvider } from "@/services/ai/provider";
import { runOptionalKnowledgeGraphAiEnhancement } from "@/services/knowledge-graph/ai-enhancement";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

const base = {
  nodes: [
    { key: "a", type: "KNOWLEDGE_POINT" },
    { key: "b", type: "KNOWLEDGE_POINT" },
  ],
  edges: [],
} as unknown as KnowledgeGraphStructure;

function provider(responses: unknown[]): AIProvider {
  let index = 0;
  return {
    name: "test-provider",
    model: "test-model",
    analyzeStudentPerformance: async () => ({}),
    parseSyllabus: async () => ({}),
    inferKnowledgeGraphRelations: async () => {
      const response = responses[index++];
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

test("RELATED inference succeeds on the first attempt", async () => {
  const result = await runOptionalKnowledgeGraphAiEnhancement(base, () =>
    provider([
      { related: [{ from: "a", to: "b", description: null, confidence: 0.8 }] },
    ]),
  );
  assert.equal(result.status, AIEnhancementStatus.SUCCEEDED);
  assert.equal(result.attemptCount, 1);
  assert.equal(result.warningCode, null);
  assert.equal(result.inference.related.length, 1);
});

test("RELATED inference retries once and preserves a later success", async () => {
  const result = await runOptionalKnowledgeGraphAiEnhancement(base, () =>
    provider([
      new Error("temporary outage"),
      { related: [{ from: "a", to: "b", description: null, confidence: 0.8 }] },
    ]),
  );
  assert.equal(result.status, AIEnhancementStatus.SUCCEEDED);
  assert.equal(result.attemptCount, 2);
  assert.equal(result.inference.related.length, 1);
});

test("two provider failures degrade to an empty RELATED result", async () => {
  const result = await runOptionalKnowledgeGraphAiEnhancement(base, () =>
    provider([new Error("outage"), new Error("outage")]),
  );
  assert.equal(result.status, AIEnhancementStatus.FAILED);
  assert.equal(result.attemptCount, 2);
  assert.equal(result.warningCode, "PROVIDER_UNAVAILABLE");
  assert.deepEqual(result.inference, { related: [] });
});

test("invalid JSON retries once then records PROVIDER_SCHEMA_INVALID", async () => {
  const result = await runOptionalKnowledgeGraphAiEnhancement(base, () =>
    provider(["not-json", "still-not-json"]),
  );
  assert.equal(result.status, AIEnhancementStatus.FAILED);
  assert.equal(result.attemptCount, 2);
  assert.equal(result.warningCode, "PROVIDER_SCHEMA_INVALID");
  assert.deepEqual(result.inference, { related: [] });
});
