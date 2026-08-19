import {
  AIProviderRequestError,
  type AIThinkingMode,
} from "@/services/ai/provider";

export const DEFAULT_SYLLABUS_MAX_COMPLETION_TOKENS = 32_768;
export const MAX_SYLLABUS_MAX_COMPLETION_TOKENS = 384_000;
export const DEFAULT_KNOWLEDGE_GRAPH_MAX_COMPLETION_TOKENS = 8_192;
export const DEFAULT_QUALITY_REPORT_MAX_COMPLETION_TOKENS = 8_192;
export const MAX_OPERATION_MAX_COMPLETION_TOKENS = 64_000;

export function parseSyllabusMaxCompletionTokens(
  value: string | undefined,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_SYLLABUS_MAX_COMPLETION_TOKENS)
    : DEFAULT_SYLLABUS_MAX_COMPLETION_TOKENS;
}

export function parseOperationMaxCompletionTokens(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, MAX_OPERATION_MAX_COMPLETION_TOKENS)
    : fallback;
}

export function resolveAIThinkingMode(
  value: string | undefined,
  baseUrl: string,
): AIThinkingMode | undefined {
  const normalized = value?.trim();
  if (normalized === "enabled" || normalized === "disabled") {
    return normalized;
  }
  if (normalized) {
    throw new AIProviderRequestError(
      `Unsupported AI_THINKING_MODE: ${normalized}`,
      "PROVIDER_NOT_CONFIGURED",
    );
  }
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "api.deepseek.com"
      ? "disabled"
      : undefined;
  } catch {
    return undefined;
  }
}
