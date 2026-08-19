import assert from "node:assert/strict";
import test from "node:test";

import { AIEnhancementStatus } from "@prisma/client";
import type { AIProvider } from "@/services/ai/provider";
import { runOptionalKnowledgeGraphAiEnhancement } from "@/services/knowledge-graph/ai-enhancement";
import { deterministicGraph } from "@/services/knowledge-graph/generator";
import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";

const syllabus: SyllabusParseOutput = {
  courseInfo: {
    courseName: "Python",
    courseCode: "PY",
    credits: null,
    totalHours: null,
    theoryHours: null,
    practiceHours: null,
    description: null,
    sourceRefs: [],
  },
  objectives: [],
  chapters: [
    {
      code: "CH-1",
      title: "基础",
      description: null,
      suggestedHours: null,
      order: 1,
      sourceRefs: [],
      knowledgePoints: [
        {
          code: "A",
          name: "A",
          description: null,
          importance: "CORE",
          sourceRefs: [],
        },
        {
          code: "B",
          name: "B",
          description: null,
          importance: "CORE",
          sourceRefs: [],
        },
      ],
    },
  ],
  practiceItems: [],
  prerequisites: [],
  keyTopics: [],
  difficultTopics: [],
  assessments: [],
  objectiveAssessmentMappings: [],
  materials: [],
  warnings: [],
};
const base = deterministicGraph("ai-degradation", syllabus);
const a = "syllabus:kp:A";
const b = "syllabus:kp:B";

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
      { related: [{ from: a, to: b, description: null, confidence: 0.8 }] },
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
      { related: [{ from: a, to: b, description: null, confidence: 0.8 }] },
    ]),
  );
  assert.equal(result.status, AIEnhancementStatus.SUCCEEDED);
  assert.equal(result.attemptCount, 2);
  assert.equal(result.inference.related.length, 1);
});

test("three provider failures degrade to an empty RELATED result", async () => {
  const result = await runOptionalKnowledgeGraphAiEnhancement(base, () =>
    provider([new Error("outage"), new Error("outage"), new Error("outage")]),
  );
  assert.equal(result.status, AIEnhancementStatus.FAILED);
  assert.equal(result.attemptCount, 3);
  assert.equal(result.warningCode, "PROVIDER_UNAVAILABLE");
  assert.deepEqual(result.inference, { related: [] });
});

test("invalid JSON uses two repair retries then records PROVIDER_SCHEMA_INVALID", async () => {
  const result = await runOptionalKnowledgeGraphAiEnhancement(base, () =>
    provider(["not-json", "still-not-json", "invalid-again"]),
  );
  assert.equal(result.status, AIEnhancementStatus.FAILED);
  assert.equal(result.attemptCount, 3);
  assert.equal(result.warningCode, "PROVIDER_SCHEMA_INVALID");
  assert.deepEqual(result.inference, { related: [] });
});

test("悬空 RELATED 建议重试后降级且不污染基础草稿", async () => {
  const result = await runOptionalKnowledgeGraphAiEnhancement(base, () =>
    provider([
      {
        related: [
          { from: a, to: "missing", description: null, confidence: 0.8 },
        ],
      },
      {
        related: [
          { from: "missing", to: b, description: null, confidence: 0.8 },
        ],
      },
      {
        related: [
          { from: a, to: "missing-again", description: null, confidence: 0.8 },
        ],
      },
    ]),
  );
  assert.equal(result.status, AIEnhancementStatus.FAILED);
  assert.equal(result.warningCode, "PROVIDER_SCHEMA_INVALID");
  assert.deepEqual(result.inference, { related: [] });
});
