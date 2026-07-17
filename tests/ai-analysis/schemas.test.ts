import assert from "node:assert/strict";
import test from "node:test";

import { studentAnalysisOutputSchema } from "../../services/ai/schemas";

test("analysis output schema accepts the required strict structure", () => {
  const result = studentAnalysisOutputSchema.parse({
    overallLevel: "BASIC",
    masteredKnowledgePoints: [
      { knowledgePointId: "kp-1", reason: "近期正确率稳定。" },
    ],
    weakKnowledgePoints: [
      { knowledgePointId: "kp-2", severity: 4, reason: "连续答错。" },
    ],
    errorPatterns: [{ type: "CONCEPT", evidence: "混淆两个概念。" }],
    suggestions: ["先复习定义。"],
    recommendedDifficulty: 2,
    confidence: 0.75,
  });
  assert.equal(result.overallLevel, "BASIC");
});

test("analysis output schema rejects extra fields and invalid ranges", () => {
  assert.equal(
    studentAnalysisOutputSchema.safeParse({
      overallLevel: "EXPERT",
      masteredKnowledgePoints: [],
      weakKnowledgePoints: [
        { knowledgePointId: "kp-2", severity: 6, reason: "错误" },
      ],
      errorPatterns: [],
      suggestions: [],
      recommendedDifficulty: 8,
      confidence: 1.2,
      studentName: "不应出现",
    }).success,
    false,
  );
});

test("a knowledge point cannot be both mastered and weak", () => {
  const result = studentAnalysisOutputSchema.safeParse({
    overallLevel: "BASIC",
    masteredKnowledgePoints: [{ knowledgePointId: "kp-1", reason: "正确率高" }],
    weakKnowledgePoints: [
      { knowledgePointId: "kp-1", severity: 2, reason: "近期波动" },
    ],
    errorPatterns: [],
    suggestions: [],
    recommendedDifficulty: 2,
    confidence: 0.5,
  });
  assert.equal(result.success, false);
});
