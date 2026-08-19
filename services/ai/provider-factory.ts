import "server-only";

import { MockAIProvider } from "@/services/ai/mock-provider";
import { OpenAICompatibleProvider } from "@/services/ai/openai-compatible";
import type { AIProvider } from "@/services/ai/provider";
import {
  AIProviderRequestError,
  type AIEndpointType,
} from "@/services/ai/provider";
import {
  DEFAULT_KNOWLEDGE_GRAPH_MAX_COMPLETION_TOKENS,
  DEFAULT_QUALITY_REPORT_MAX_COMPLETION_TOKENS,
  parseOperationMaxCompletionTokens,
  parseSyllabusMaxCompletionTokens,
  resolveAIThinkingMode,
} from "@/services/ai/provider-config";

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
  const syllabusMaxCompletionTokens = parseSyllabusMaxCompletionTokens(
    process.env.SYLLABUS_AI_MAX_COMPLETION_TOKENS,
  );
  const knowledgeGraphMaxCompletionTokens = parseOperationMaxCompletionTokens(
    process.env.KNOWLEDGE_GRAPH_AI_MAX_COMPLETION_TOKENS,
    DEFAULT_KNOWLEDGE_GRAPH_MAX_COMPLETION_TOKENS,
  );
  const qualityReportMaxCompletionTokens = parseOperationMaxCompletionTokens(
    process.env.QUALITY_REPORT_AI_MAX_COMPLETION_TOKENS,
    DEFAULT_QUALITY_REPORT_MAX_COMPLETION_TOKENS,
  );
  return new OpenAICompatibleProvider({
    apiKey,
    baseUrl,
    model,
    endpointType: parseEndpointType(process.env.AI_API_TYPE),
    thinkingMode: resolveAIThinkingMode(process.env.AI_THINKING_MODE, baseUrl),
    syllabusMaxCompletionTokens,
    knowledgeGraphMaxCompletionTokens,
    qualityReportMaxCompletionTokens,
    timeoutMs: parseTimeout(process.env.AI_TIMEOUT_MS),
  });
}

function parseEndpointType(value: string | undefined): AIEndpointType {
  const normalized = value?.trim() || "chat-completions";
  if (normalized === "chat-completions" || normalized === "responses")
    return normalized;
  throw new AIProviderRequestError(
    `Unsupported AI_API_TYPE: ${normalized}`,
    "PROVIDER_NOT_CONFIGURED",
  );
}

function parseTimeout(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 8_000;
}
