import assert from "node:assert/strict";
import test from "node:test";

import {
  generateLearningAnalysis,
  getLearningAnalysis,
} from "../../lib/api/learning-analysis";

const analysis = {
  overallLevel: "BASIC",
  masteredKnowledgePoints: [],
  weakKnowledgePoints: [],
  errorPatterns: [],
  suggestions: ["继续练习。"],
  recommendedDifficulty: 2,
  confidence: 0.7,
};

function response(
  status: number,
  body: unknown,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("GET parses analysis JSON and complete metadata headers", async () => {
  const result = await getLearningAnalysis("submission-1", {
    fetchImplementation: async () =>
      response(
        200,
        { success: true, data: analysis },
        {
          "X-Learning-Analysis-Source": "AI",
          "X-Learning-Analysis-Model": "actual-model",
          "X-Learning-Analysis-Prompt-Version": "student-analysis-v1",
          "X-Learning-Analysis-Generated-At": "2026-07-17T10:00:00.000Z",
          "X-Learning-Analysis-Fallback": "false",
        },
      ),
  });
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.deepEqual(result.analysis, analysis);
    assert.deepEqual(result.metadata, {
      source: "AI",
      model: "actual-model",
      promptVersion: "student-analysis-v1",
      generatedAt: "2026-07-17T10:00:00.000Z",
      fallback: false,
    });
  }
});

test("GET tolerates missing metadata headers", async () => {
  const result = await getLearningAnalysis("submission-2", {
    fetchImplementation: async () =>
      response(200, { success: true, data: analysis }),
  });
  assert.equal(result.status, "success");
  if (result.status === "success") assert.equal(result.metadata, null);
});

test("GET maps not found and pending statuses", async () => {
  const notFound = await getLearningAnalysis("submission-3", {
    fetchImplementation: async () => response(404, { success: false }),
  });
  const pending = await getLearningAnalysis("submission-4", {
    fetchImplementation: async () => response(409, { success: false }),
  });
  assert.deepEqual(notFound, { status: "not_found" });
  assert.deepEqual(pending, { status: "pending" });
});

test("POST returns a generated analysis result", async () => {
  let method: string | undefined;
  const result = await generateLearningAnalysis("submission-5", {
    fetchImplementation: async (_input, init) => {
      method = init?.method;
      return response(200, { success: true, data: analysis });
    },
  });
  assert.equal(method, "POST");
  assert.equal(result.status, "success");
});

test("network and server failures become safe local messages", async () => {
  const network = await getLearningAnalysis("submission-6", {
    fetchImplementation: async () => {
      throw new Error("secret provider stack");
    },
  });
  const server = await getLearningAnalysis("submission-7", {
    fetchImplementation: async () =>
      response(500, {
        success: false,
        error: "API_KEY=secret and raw provider stack",
      }),
  });
  assert.equal(network.status, "failed");
  assert.equal(server.status, "failed");
  if (network.status === "failed") {
    assert.doesNotMatch(network.message, /secret|stack|API_KEY/u);
  }
  if (server.status === "failed") {
    assert.doesNotMatch(server.message, /secret|stack|API_KEY/u);
  }
});

test("invalid success payload is rejected before rendering", async () => {
  const result = await getLearningAnalysis("submission-8", {
    fetchImplementation: async () =>
      response(200, {
        success: true,
        data: { ...analysis, confidence: 12, rawPrompt: "secret" },
      }),
  });
  assert.deepEqual(result, {
    status: "failed",
    message: "学情分析数据格式异常，请稍后重试",
  });
});
