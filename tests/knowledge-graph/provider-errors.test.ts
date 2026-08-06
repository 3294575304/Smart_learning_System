import assert from "node:assert/strict";
import test from "node:test";

import { OpenAICompatibleProvider } from "@/services/ai/openai-compatible";
import { AIProviderRequestError } from "@/services/ai/provider";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

const graph = {
  nodes: [],
  edges: [],
} as unknown as KnowledgeGraphStructure;

async function captureCode(response: Response) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response;
  try {
    const provider = new OpenAICompatibleProvider({
      apiKey: "configured-secret",
      baseUrl: "https://provider.example/v1/chat/completions",
      model: "model",
      timeoutMs: 100,
      logger: { error: () => undefined },
    });
    await provider.inferKnowledgeGraphRelations!(graph, {
      signal: new AbortController().signal,
    });
    return null;
  } catch (error) {
    assert.ok(error instanceof AIProviderRequestError);
    return error.code;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test(
  "OpenAI-compatible HTTP statuses map to safe provider codes",
  { concurrency: false },
  async () => {
    const cases = [
      [401, "PROVIDER_UNAUTHORIZED"],
      [403, "PROVIDER_FORBIDDEN"],
      [404, "PROVIDER_MODEL_NOT_FOUND"],
      [429, "PROVIDER_RATE_LIMITED"],
      [503, "PROVIDER_UNAVAILABLE"],
    ] as const;
    for (const [status, code] of cases)
      assert.equal(
        await captureCode(
          new Response(JSON.stringify({ error: "safe" }), {
            status,
            headers: { "content-type": "application/json" },
          }),
        ),
        code,
      );
  },
);

test(
  "HTML success responses are rejected as PROVIDER_BAD_RESPONSE",
  { concurrency: false },
  async () => {
    assert.equal(
      await captureCode(
        new Response("<html>login</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
      "PROVIDER_BAD_RESPONSE",
    );
  },
);
