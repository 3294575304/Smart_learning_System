import "server-only";

import { MockAIProvider } from "@/services/ai/mock-provider";
import { OpenAICompatibleProvider } from "@/services/ai/openai-compatible";
import type { AIProvider } from "@/services/ai/provider";
import { AIProviderRequestError } from "@/services/ai/provider";

export function createAIProvider(): AIProvider {
  const provider =
    process.env.AI_PROVIDER?.trim() ||
    (process.env.NODE_ENV === "production" ? "openai-compatible" : "mock");
  if (provider === "mock") return new MockAIProvider();
  if (provider !== "openai-compatible") {
    throw new AIProviderRequestError(
      `Unsupported AI_PROVIDER: ${provider}`,
      "PROVIDER_NOT_CONFIGURED",
    );
  }

  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) {
    throw new AIProviderRequestError(
      "AI_API_KEY、AI_BASE_URL 和 AI_MODEL 是真实 Provider 的必填配置",
      "PROVIDER_NOT_CONFIGURED",
    );
  }
  const configuredMaxTokens = Number(
    process.env.SYLLABUS_AI_MAX_COMPLETION_TOKENS,
  );
  const syllabusMaxCompletionTokens =
    Number.isInteger(configuredMaxTokens) && configuredMaxTokens > 0
      ? Math.min(configuredMaxTokens, 8_192)
      : 8_192;
  return new OpenAICompatibleProvider({
    apiKey,
    baseUrl,
    model,
    syllabusMaxCompletionTokens,
    timeoutMs: parseTimeout(process.env.AI_TIMEOUT_MS),
  });
}

function parseTimeout(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 8_000;
}
