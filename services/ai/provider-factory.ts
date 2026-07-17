import "server-only";

import { MockAIProvider } from "@/services/ai/mock-provider";
import { OpenAICompatibleProvider } from "@/services/ai/openai-compatible";
import type { AIProvider } from "@/services/ai/provider";

export function createAIProvider(): AIProvider {
  const provider =
    process.env.AI_PROVIDER?.trim() ||
    (process.env.NODE_ENV === "production" ? "openai-compatible" : "mock");
  if (provider === "mock") return new MockAIProvider();
  if (provider !== "openai-compatible") {
    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  }

  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) {
    throw new Error(
      "AI_API_KEY、AI_BASE_URL 和 AI_MODEL 是真实 Provider 的必填配置",
    );
  }
  return new OpenAICompatibleProvider({ apiKey, baseUrl, model });
}
