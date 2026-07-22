import assert from "node:assert/strict";
import test from "node:test";

import { executeConfiguredStudentAnalysis } from "@/services/ai/configured-execution";
import type { AIProvider } from "@/services/ai/provider";
import type { StudentAnalysisInput } from "@/services/ai/schemas";

const input: StudentAnalysisInput = {
  anonymousStudentId: "anonymous-student",
  answers: [
    {
      knowledgePointIds: ["kp-1"],
      difficulty: 2,
      studentAnswer: "4",
      standardAnswer: "4",
      isCorrect: true,
      responseTimeMs: 1000,
    },
  ],
  historicalKnowledgePointAccuracy: [],
  recentErrors: [],
  tutoringSummaries: [],
};

test("关闭 AI 增强后不调用 Provider 并返回规则分析", async () => {
  let calls = 0;
  const provider: AIProvider = {
    name: "never-called",
    model: "never-called",
    async analyzeStudentPerformance() {
      calls += 1;
      throw new Error("provider should not be called");
    },
  };
  const result = await executeConfiguredStudentAnalysis(
    false,
    provider,
    input,
    1000,
  );
  assert.equal(calls, 0);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, "AI_DISABLED_BY_SYSTEM_CONFIG");
  assert.equal(result.output.overallLevel.length > 0, true);
});
