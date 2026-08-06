import { AIEnhancementStatus } from "@prisma/client";
import { ZodError } from "zod";

import {
  AIProviderRequestError,
  type AIProvider,
} from "@/services/ai/provider";
import { KNOWLEDGE_GRAPH_MAX_AI_ATTEMPTS } from "@/services/knowledge-graph/constants";
import { KnowledgeGraphOperationError } from "@/services/knowledge-graph/errors";
import { mergeRelated } from "@/services/knowledge-graph/generator";
import {
  relatedInferenceSchema,
  type KnowledgeGraphStructure,
} from "@/services/knowledge-graph/schemas";
import { KnowledgeGraphValidationError } from "@/services/knowledge-graph/validation";

export async function runOptionalKnowledgeGraphAiEnhancement(
  base: KnowledgeGraphStructure,
  providerFactory: () => AIProvider,
) {
  let provider: AIProvider | undefined;
  let last: unknown;
  let attemptCount = 0;
  try {
    provider = providerFactory();
    if (!provider.inferKnowledgeGraphRelations)
      throw new KnowledgeGraphOperationError(
        "当前 AI Provider 不支持知识图谱关系推断。",
        502,
        "PROVIDER_UNSUPPORTED",
      );
    for (
      let attempt = 0;
      attempt < KNOWLEDGE_GRAPH_MAX_AI_ATTEMPTS;
      attempt += 1
    ) {
      attemptCount = attempt + 1;
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        knowledgeGraphAiTimeoutMs(),
      );
      try {
        const raw = await provider.inferKnowledgeGraphRelations(base, {
          signal: controller.signal,
          validationError: last instanceof Error ? last.message : undefined,
        });
        const inference = relatedInferenceSchema.parse(
          typeof raw === "string" ? JSON.parse(raw) : raw,
        );
        // Endpoint, duplicate, self-loop and graph invariants are part of AI
        // output validation so invalid suggestions degrade instead of failing
        // the deterministic draft after the retry loop has already ended.
        mergeRelated(base, inference);
        return {
          status: AIEnhancementStatus.SUCCEEDED,
          provider,
          inference,
          attemptCount,
          warningCode: null,
          warningMessage: null,
        };
      } catch (error) {
        last = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw last;
  } catch (error) {
    const code = classifyAiEnhancementError(error);
    return {
      status: AIEnhancementStatus.FAILED,
      provider,
      inference: { related: [] },
      attemptCount,
      warningCode: code,
      warningMessage: aiWarningMessage(code),
    };
  }
}

function knowledgeGraphAiTimeoutMs() {
  const configured = Number(process.env.AI_TIMEOUT_MS);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 600_000)
    : 30_000;
}

function classifyAiEnhancementError(error: unknown) {
  if (error instanceof KnowledgeGraphOperationError) return error.code;
  if (error instanceof AIProviderRequestError) return error.code;
  if (error instanceof DOMException && error.name === "AbortError")
    return "PROVIDER_TIMEOUT";
  if (error instanceof ZodError || error instanceof SyntaxError)
    return "PROVIDER_SCHEMA_INVALID";
  if (
    error instanceof KnowledgeGraphValidationError ||
    (error instanceof Error && error.message.startsWith("AI_RELATED_"))
  )
    return "PROVIDER_SCHEMA_INVALID";
  return "PROVIDER_UNAVAILABLE";
}

function aiWarningMessage(code: string) {
  const messages: Record<string, string> = {
    PROVIDER_NOT_CONFIGURED: "AI 服务尚未正确配置。",
    PROVIDER_UNAUTHORIZED: "AI 服务鉴权失败。",
    PROVIDER_FORBIDDEN: "AI 服务拒绝了当前请求。",
    PROVIDER_MODEL_NOT_FOUND: "AI 模型不存在或接口地址不正确。",
    PROVIDER_RATE_LIMITED: "AI 服务请求过于频繁。",
    PROVIDER_TIMEOUT: "AI 服务响应超时。",
    PROVIDER_HTTP_ERROR: "AI 服务返回了 HTTP 错误。",
    PROVIDER_EMPTY_RESPONSE: "AI 服务返回了空响应。",
    PROVIDER_UNREADABLE_RESPONSE: "AI 服务返回了不可读取的响应。",
    PROVIDER_BAD_RESPONSE: "AI 服务返回了无法读取的响应。",
    PROVIDER_SCHEMA_INVALID: "AI 返回的 RELATED 关系格式无效。",
    PROVIDER_UNAVAILABLE: "AI 服务暂时不可用。",
    PROVIDER_UNSUPPORTED: "当前 AI 服务不支持 RELATED 关系推断。",
  };
  return messages[code] ?? "AI RELATED 关系推断失败。";
}
