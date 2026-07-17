import assert from "node:assert/strict";
import test from "node:test";

import { loadLearningAnalysis } from "../../components/learning-analysis/learning-analysis-loader";
import type { LearningAnalysisRequests } from "../../components/learning-analysis/learning-analysis-loader";
import type { LearningAnalysisFetchResult } from "../../lib/api/learning-analysis";

const success: LearningAnalysisFetchResult = {
  status: "success",
  analysis: {
    overallLevel: "BASIC",
    masteredKnowledgePoints: [],
    weakKnowledgePoints: [],
    errorPatterns: [],
    suggestions: [],
    recommendedDifficulty: 2,
    confidence: 0.7,
  },
  metadata: null,
};

function requests(
  getResult: LearningAnalysisFetchResult,
  generate: () => Promise<LearningAnalysisFetchResult>,
): LearningAnalysisRequests {
  return {
    get: async () => getResult,
    generate: async () => generate(),
  };
}

test("historical analysis is reused without POST", async () => {
  let generateCalls = 0;
  const result = await loadLearningAnalysis(
    "history-submission",
    undefined,
    requests(success, async () => {
      generateCalls += 1;
      return success;
    }),
  );
  assert.equal(result.status, "success");
  assert.equal(generateCalls, 0);
});

test("concurrent 404 loads share one generation request", async () => {
  let generateCalls = 0;
  let resolveGeneration:
    ((value: LearningAnalysisFetchResult) => void) | undefined;
  const generation = new Promise<LearningAnalysisFetchResult>((resolve) => {
    resolveGeneration = resolve;
  });
  const api = requests({ status: "not_found" }, async () => {
    generateCalls += 1;
    return generation;
  });

  const first = loadLearningAnalysis("same-submission", undefined, api);
  const second = loadLearningAnalysis("same-submission", undefined, api);
  await Promise.resolve();
  assert.equal(generateCalls, 1);
  resolveGeneration?.(success);
  const results = await Promise.all([first, second]);
  assert.deepEqual(results, [success, success]);
});

test("pending GET does not trigger generation", async () => {
  let generateCalls = 0;
  const result = await loadLearningAnalysis(
    "pending-submission",
    undefined,
    requests({ status: "pending" }, async () => {
      generateCalls += 1;
      return success;
    }),
  );
  assert.deepEqual(result, { status: "pending" });
  assert.equal(generateCalls, 0);
});

test("aborted 404 request does not start generation", async () => {
  let generateCalls = 0;
  const controller = new AbortController();
  const api = requests({ status: "not_found" }, async () => {
    generateCalls += 1;
    return success;
  });
  controller.abort();
  const result = await loadLearningAnalysis(
    "aborted-submission",
    controller.signal,
    api,
  );
  assert.equal(result.status, "failed");
  assert.equal(generateCalls, 0);
});

test("not-found state announces generation before POST completes", async () => {
  let generating = false;
  const result = await loadLearningAnalysis(
    "generate-status-submission",
    undefined,
    requests({ status: "not_found" }, async () => success),
    () => {
      generating = true;
    },
  );
  assert.equal(generating, true);
  assert.equal(result.status, "success");
});
