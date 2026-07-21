import assert from "node:assert/strict";
import test from "node:test";

import {
  generateRecommendations,
  recommendationStartApiPath,
  startRecommendationRequest,
} from "../../lib/api/recommendations";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("generation client sends the actual API request shape", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await generateRecommendations(
    {
      studentId: "student-1",
      classroomId: "classroom-1",
      recommendedDifficulty: 3,
      limit: 10,
    },
    {
      fetchImplementation: async (input, init) => {
        requestUrl = input.toString();
        requestInit = init;
        return response(200, { success: true, data: { items: [] } });
      },
    },
  );

  assert.equal(result.success, true);
  assert.equal(requestUrl, "/api/recommendations");
  assert.equal(requestInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    studentId: "student-1",
    classroomId: "classroom-1",
    recommendedDifficulty: 3,
    limit: 10,
  });
});

test("start client uses the real encoded start endpoint", async () => {
  let requestUrl = "";
  let requestMethod: string | undefined;
  const result = await startRecommendationRequest("recommendation/1", {
    fetchImplementation: async (input, init) => {
      requestUrl = input.toString();
      requestMethod = init?.method;
      return response(200, { success: true, data: { status: "STARTED" } });
    },
  });

  assert.equal(result.success, true);
  assert.equal(requestUrl, "/api/recommendations/recommendation%2F1/start");
  assert.equal(requestUrl, recommendationStartApiPath("recommendation/1"));
  assert.equal(requestMethod, "POST");
});

test("network and malformed responses produce friendly errors", async () => {
  const network = await startRecommendationRequest("recommendation-1", {
    fetchImplementation: async () => {
      throw new Error("database password and provider stack");
    },
  });
  const malformed = await startRecommendationRequest("recommendation-1", {
    fetchImplementation: async () => response(502, { rawError: "secret" }),
  });

  assert.equal(network.success, false);
  assert.equal(malformed.success, false);
  if (!network.success) assert.doesNotMatch(network.error, /password|stack/u);
  if (!malformed.success) assert.doesNotMatch(malformed.error, /secret/u);
});
