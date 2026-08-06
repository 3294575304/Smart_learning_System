import { z } from "zod";

import { buildStudentAnalysisMessages } from "@/services/ai/prompt";
import {
  AIProviderRequestError,
  type AIProvider,
  type AIProviderOptions,
  type AIProviderResponse,
} from "@/services/ai/provider";
import type { StudentAnalysisInput } from "@/services/ai/schemas";
import { buildSyllabusParseMessages } from "@/services/syllabus-parsing/prompt";
import type { SyllabusParseInput } from "@/services/syllabus-parsing/schemas";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

const completionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export interface OpenAICompatibleProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  syllabusMaxCompletionTokens?: number;
  timeoutMs?: number;
  logger?: Pick<Console, "error">;
}

export class OpenAICompatibleProvider implements AIProvider {
  /** This fetch-based client never retries; the business layer owns repair retries. */
  readonly maxRetries = 0;
  readonly name = "openai-compatible";
  readonly model: string;
  private readonly endpoint: string;
  private readonly logger: Pick<Console, "error">;

  constructor(private readonly config: OpenAICompatibleProviderConfig) {
    this.model = config.model;
    const normalized = config.baseUrl
      .replace(/\/+$/u, "")
      .replace(/\/chat\/completions$/u, "");
    this.endpoint = `${normalized}/chat/completions`;
    this.logger = config.logger ?? console;
  }

  async analyzeStudentPerformance(
    input: StudentAnalysisInput,
    options: AIProviderOptions,
  ): Promise<unknown> {
    return (
      await this.completeJson(
        buildStudentAnalysisMessages(input, options.validationError),
        options.signal,
      )
    ).content;
  }

  async parseSyllabus(
    input: SyllabusParseInput,
    options: AIProviderOptions,
  ): Promise<AIProviderResponse> {
    return this.completeJson(
      buildSyllabusParseMessages(input, options.validationError),
      options.signal,
      this.config.syllabusMaxCompletionTokens ?? 8_192,
    );
  }

  async inferKnowledgeGraphRelations(
    input: KnowledgeGraphStructure,
    options: AIProviderOptions,
  ): Promise<unknown> {
    const repair = options.validationError
      ? `上次输出无效：${options.validationError}。请修复。`
      : "";
    return (
      await this.completeJson(
        [
          {
            role: "system",
            content: `只根据给定知识点提出少量 RELATED 无向关系。只返回 {\"related\":[{\"from\":节点key,\"to\":节点key,\"description\":说明或null,\"confidence\":0到1}]}。不得添加节点、先修或包含关系。${repair}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              nodes: input.nodes
                .filter((node) => node.type === "KNOWLEDGE_POINT")
                .map(({ key, code, name, description }) => ({
                  key,
                  code,
                  name,
                  description,
                })),
            }),
          },
        ],
        options.signal,
      )
    ).content;
  }

  private async completeJson(
    messages: Array<{ role: "system" | "user"; content: string }>,
    signal: AbortSignal,
    maxCompletionTokens?: number,
  ): Promise<AIProviderResponse> {
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          ...(maxCompletionTokens ? { max_tokens: maxCompletionTokens } : {}),
          messages,
        }),
        signal,
      });
    } catch (error: unknown) {
      if (
        signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        this.logNetworkDiagnostic("PROVIDER_TIMEOUT", error);
        throw new AIProviderRequestError(
          "AI provider request timed out",
          "PROVIDER_TIMEOUT",
        );
      }
      this.logNetworkDiagnostic("PROVIDER_UNAVAILABLE", error);
      throw new AIProviderRequestError(
        "AI provider is unavailable",
        "PROVIDER_UNAVAILABLE",
      );
    }

    if (!response.ok) {
      const summary = await safeResponseSummary(response);
      const code = providerHttpErrorCode(response.status);
      this.logDiagnostic(code, response, summary);
      throw new AIProviderRequestError(
        `AI provider returned HTTP ${response.status}`,
        code,
        response.headers.get("x-request-id"),
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().includes("text/html")) {
      const summary = await safeResponseSummary(response);
      this.logDiagnostic("PROVIDER_BAD_RESPONSE", response, summary);
      throw new AIProviderRequestError(
        "AI provider returned a non-JSON response",
        "PROVIDER_BAD_RESPONSE",
        response.headers.get("x-request-id"),
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      this.logDiagnostic("PROVIDER_BAD_RESPONSE", response, "unreadable JSON");
      throw new AIProviderRequestError(
        "AI provider returned an unreadable response",
        "PROVIDER_BAD_RESPONSE",
        response.headers.get("x-request-id"),
      );
    }
    const parsed = completionResponseSchema.safeParse(payload);
    if (!parsed.success) {
      this.logDiagnostic(
        "PROVIDER_SCHEMA_INVALID",
        response,
        parsed.error.issues
          .slice(0, 3)
          .map((issue) => issue.path.join("."))
          .join(", "),
      );
      throw new AIProviderRequestError(
        "AI provider returned an incompatible response",
        "PROVIDER_SCHEMA_INVALID",
        response.headers.get("x-request-id"),
      );
    }
    const choice = parsed.data.choices[0];
    return {
      content: choice.message.content,
      requestId: response.headers.get("x-request-id"),
      finishReason: choice.finish_reason ?? null,
      usage: {
        promptTokens: parsed.data.usage?.prompt_tokens ?? null,
        completionTokens: parsed.data.usage?.completion_tokens ?? null,
        totalTokens: parsed.data.usage?.total_tokens ?? null,
      },
      responseLength: choice.message.content.length,
    };
  }

  private logDiagnostic(
    code: string,
    response: Response,
    responseSummary: string,
  ) {
    this.logger.error("[ai-provider-request-failed]", {
      code,
      provider: this.name,
      baseUrl: this.config.baseUrl,
      model: this.model,
      timeoutMs: this.config.timeoutMs ?? 8_000,
      apiKeyConfigured: Boolean(this.config.apiKey),
      httpStatus: response.status,
      responseContentType: response.headers.get("content-type"),
      responseSummary,
    });
  }

  private logNetworkDiagnostic(code: string, error: unknown) {
    this.logger.error("[ai-provider-request-failed]", {
      code,
      provider: this.name,
      baseUrl: this.config.baseUrl,
      model: this.model,
      timeoutMs: this.config.timeoutMs ?? 8_000,
      apiKeyConfigured: Boolean(this.config.apiKey),
      httpStatus: null,
      responseContentType: null,
      responseSummary:
        error instanceof Error ? error.name.slice(0, 100) : "UnknownError",
    });
  }
}

function providerHttpErrorCode(status: number) {
  if (status === 401) return "PROVIDER_UNAUTHORIZED" as const;
  if (status === 403) return "PROVIDER_FORBIDDEN" as const;
  if (status === 404) return "PROVIDER_MODEL_NOT_FOUND" as const;
  if (status === 429) return "PROVIDER_RATE_LIMITED" as const;
  return status >= 500
    ? ("PROVIDER_UNAVAILABLE" as const)
    : ("PROVIDER_BAD_RESPONSE" as const);
}

async function safeResponseSummary(response: Response) {
  try {
    return (await response.text())
      .slice(0, 500)
      .replace(/Bearer\s+\S+/giu, "Bearer [REDACTED]")
      .replace(/(?:sk-|key[-_]?)[A-Za-z0-9_-]{8,}/giu, "[REDACTED]");
  } catch {
    return "unreadable response body";
  }
}
