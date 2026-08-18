import assert from "node:assert/strict";
import test from "node:test";

import { OpenAICompatibleProvider } from "@/services/ai/openai-compatible";
import { AIProviderRequestError } from "@/services/ai/provider";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

const graph = {
  nodes: [],
  edges: [],
} as unknown as KnowledgeGraphStructure;

async function invoke(
  response: Response,
  endpointType: "chat-completions" | "responses" = "chat-completions",
  thinkingMode?: "enabled" | "disabled",
) {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody: unknown = null;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return response;
  };
  try {
    const provider = new OpenAICompatibleProvider({
      apiKey: "configured-secret",
      baseUrl: "https://provider.example/v1",
      model: "model",
      endpointType,
      thinkingMode,
      timeoutMs: 100,
      logger: { error: () => undefined, info: () => undefined },
    });
    const content = await provider.inferKnowledgeGraphRelations!(graph, {
      signal: new AbortController().signal,
    });
    return { content, requestUrl, requestBody, error: null };
  } catch (error) {
    assert.ok(error instanceof AIProviderRequestError);
    return { content: null, requestUrl, requestBody, error };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test(
  "Chat Completions 按配置发送请求并解析 choices.message.content",
  { concurrency: false },
  async () => {
    const result = await invoke(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '```json\n{"related":[]}\n```',
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    assert.deepEqual(result.content, { related: [] });
    assert.equal(
      result.requestUrl,
      "https://provider.example/v1/chat/completions",
    );
    assert.ok(
      result.requestBody &&
        typeof result.requestBody === "object" &&
        "messages" in result.requestBody &&
        "response_format" in result.requestBody,
    );
    assert.equal(
      result.requestBody &&
        typeof result.requestBody === "object" &&
        "thinking" in result.requestBody,
      false,
    );
    const messages = (
      result.requestBody as {
        messages?: Array<{ content?: unknown }>;
      }
    ).messages;
    assert.match(
      messages
        ?.map((message) =>
          typeof message.content === "string" ? message.content : "",
        )
        .join(" ") ?? "",
      /json/iu,
    );
  },
);

test(
  "Chat Completions can explicitly disable provider thinking for JSON tasks",
  { concurrency: false },
  async () => {
    const result = await invoke(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: '{"related":[]}' },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
      "chat-completions",
      "disabled",
    );
    assert.deepEqual((result.requestBody as { thinking?: unknown }).thinking, {
      type: "disabled",
    });
  },
);

test(
  "Responses API 按配置发送请求并解析 output content text",
  { concurrency: false },
  async () => {
    const result = await invoke(
      new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '{"related":[]}' }],
            },
          ],
          usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
      "responses",
    );
    assert.deepEqual(result.content, { related: [] });
    assert.equal(result.requestUrl, "https://provider.example/v1/responses");
    assert.ok(
      result.requestBody &&
        typeof result.requestBody === "object" &&
        "input" in result.requestBody &&
        "text" in result.requestBody,
    );
  },
);

test(
  "already structured compatible output is returned as an object",
  { concurrency: false },
  async () => {
    const result = await invoke(
      new Response(JSON.stringify({ related: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    assert.deepEqual(result.content, { related: [] });
  },
);

test(
  "SSE compatibility response uses the final JSON data event",
  { concurrency: false },
  async () => {
    const result = await invoke(
      new Response(
        'data: {"choices":[{"message":{"content":"{\\"related\\":[]}"}}]}\n\ndata: [DONE]\n',
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      ),
    );
    assert.deepEqual(result.content, { related: [] });
  },
);

test(
  "HTTP, HTML, empty and malformed responses receive precise safe codes",
  { concurrency: false },
  async () => {
    const cases: Array<[Response, string, string]> = [
      [
        new Response(JSON.stringify({ error: { message: "bad request" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
        "PROVIDER_HTTP_ERROR",
        "http.error",
      ],
      [
        new Response("<html>login</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
        "PROVIDER_UNREADABLE_RESPONSE",
        "body.html",
      ],
      [
        new Response("", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        "PROVIDER_EMPTY_RESPONSE",
        "body.empty",
      ],
      [
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        "PROVIDER_UNREADABLE_RESPONSE",
        "body.invalid-json",
      ],
      [
        new Response(JSON.stringify({ error: { message: "logical error" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        "PROVIDER_HTTP_ERROR",
        "json.error-object",
      ],
    ];
    for (const [response, code, branch] of cases) {
      const result = await invoke(response);
      assert.equal(result.error?.code, code);
      assert.equal(result.error?.metadata.parseBranch, branch);
      assert.equal(result.error?.metadata.httpStatus, response.status);
      assert.ok(result.error?.metadata.responseSummary);
    }
  },
);

test(
  "unsupported success envelope is classified as schema invalid",
  { concurrency: false },
  async () => {
    const result = await invoke(
      new Response(JSON.stringify({ object: "response", output: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      "responses",
    );
    assert.equal(result.error?.code, "PROVIDER_SCHEMA_INVALID");
    assert.equal(result.error?.metadata.parseBranch, "envelope.unsupported");
  },
);
