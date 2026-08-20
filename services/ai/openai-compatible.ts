import { z } from "zod";

import { buildStudentAnalysisMessages } from "@/services/ai/prompt";
import {
  AIProviderRequestError,
  type AIEndpointType,
  type AIProvider,
  type AIProviderErrorCode,
  type AIProviderOptions,
  type AIProviderResponse,
  type AIThinkingMode,
} from "@/services/ai/provider";
import type { StudentAnalysisInput } from "@/services/ai/schemas";
import { buildSyllabusParseMessages } from "@/services/syllabus-parsing/prompt";
import type { SyllabusParseInput } from "@/services/syllabus-parsing/schemas";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";
import type { QuestionMappingAIInput } from "@/services/question-mapping/schemas";
import type { SelfReflectionAIInput } from "@/services/self-reflections/schemas";
import type { QualityReportAIInput } from "@/services/quality-reports/schemas";

const chatResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.unknown().optional(),
                parsed: z.unknown().optional(),
              })
              .passthrough(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .min(1),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative().optional(),
        completion_tokens: z.number().int().nonnegative().optional(),
        total_tokens: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const responsesApiSchema = z
  .object({
    output_text: z.unknown().optional(),
    output: z.array(z.unknown()).optional(),
    status: z.string().optional(),
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative().optional(),
        output_tokens: z.number().int().nonnegative().optional(),
        total_tokens: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const providerErrorSchema = z
  .object({
    error: z
      .object({
        message: z.string().optional(),
        type: z.string().optional(),
        code: z.union([z.string(), z.number()]).nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

type ProviderLogger = {
  error: (message?: unknown, ...optionalParams: unknown[]) => void;
  info?: (message?: unknown, ...optionalParams: unknown[]) => void;
};

interface ExtractedProviderContent {
  content: unknown;
  parseBranch: string;
  finishReason: string | null;
  usage: AIProviderResponse["usage"];
}

export interface OpenAICompatibleProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  endpointType?: AIEndpointType;
  thinkingMode?: AIThinkingMode;
  syllabusMaxCompletionTokens?: number;
  knowledgeGraphMaxCompletionTokens?: number;
  qualityReportMaxCompletionTokens?: number;
  timeoutMs?: number;
  logger?: ProviderLogger;
}

export class OpenAICompatibleProvider implements AIProvider {
  /** This fetch-based client never retries; the business layer owns repair retries. */
  readonly maxRetries = 0;
  readonly name = "openai-compatible";
  readonly model: string;
  readonly endpointType: AIEndpointType;
  private readonly endpoint: string;
  private readonly logger: ProviderLogger;

  constructor(private readonly config: OpenAICompatibleProviderConfig) {
    this.model = config.model;
    this.endpointType = config.endpointType ?? "chat-completions";
    this.endpoint = endpointFor(config.baseUrl, this.endpointType);
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
      this.config.syllabusMaxCompletionTokens ?? 32_768,
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
            content: `只根据给定知识点提出少量 RELATED 无向关系。只返回严格 JSON 对象：{\"related\":[{\"from\":节点key,\"to\":节点key,\"description\":说明或null,\"confidence\":0到1}]}。不得添加节点、先修或包含关系。${repair}`,
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
        this.config.knowledgeGraphMaxCompletionTokens ?? 8_192,
      )
    ).content;
  }

  async mapQuestionsToConcepts(
    input: QuestionMappingAIInput,
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
            content: `你只负责生成题目到课程 Concept 的候选映射。只返回严格 JSON：{"mappings":[{"questionId":"...","candidates":[{"conceptId":"...","confidence":0到1,"reason":"..."}]}]}。每题最多 3 个候选；不得编造输入之外的 ID；不得输出答案、测试用例或声称候选已确认。${repair}`,
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
        options.signal,
      )
    ).content;
  }

  async structureSelfReflection(
    input: SelfReflectionAIInput,
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
            content: `把学生的学习自述整理为严格 JSON：{"summary":"...","goals":["..."],"difficulties":["..."],"learningHabits":["..."],"practiceRequest":null或{"conceptIds":["..."],"questionTypes":["SINGLE_CHOICE"等],"count":1到20,"difficulty":1到5}}。不得编造输入之外的 Concept ID，不得诊断或污名化学生；没有明确练习诉求时 practiceRequest 为 null。${repair}`,
          },
          { role: "user", content: JSON.stringify(input) },
        ],
        options.signal,
      )
    ).content;
  }

  async writeQualityReportNarrative(
    input: QualityReportAIInput,
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
            content: `你只根据去标识化的课程聚合统计撰写可供教师审核的教学质量分析初稿。严格返回 JSON：{"gradeAnalysis":"...","outcomeAnalysis":"...","outcomeDetails":[{"code":"课程目标代码","analysis":"..."}],"studentEvaluation":"...","courseSummary":"...","improvementMeasures":"..."}。outcomeDetails 只能使用输入中已有课程目标代码且每个目标恰好一项。写作要求：1）成绩分析引用平均分、及格率、优秀率、分数段分布及各考核环节均值，说明证据支持的强弱项，120-600 字；2）有达成度时，总体分析逐项比较达成度与期望值并指出差距，每项目标分析结合目标描述、考核方式占比、达成度和样本数解释，分别不少于 100 字；缺少定量证据时明确缺口，不作达成结论；3）有问卷时说明响应率，将学生自评与客观达成度对照但不得相互替代；4）课程总结综合成绩、目标、问卷与出勤中实际存在的证据，不写空泛评价；5）持续改进至少提出三项“证据—行动—验证指标”闭环措施，140-800 字。不得编造统计、学生身份或因果关系，不得用“加强教学、提高质量”等空话替代具体措施。每个字段不超过 1200 个汉字。${repair}`,
          },
          { role: "user", content: JSON.stringify(input) },
        ],
        options.signal,
        this.config.qualityReportMaxCompletionTokens ?? 8_192,
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
        body: JSON.stringify(
          requestBody(
            this.endpointType,
            this.model,
            messages,
            maxCompletionTokens,
            this.config.thinkingMode,
          ),
        ),
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
          null,
          this.networkMetadata("network.timeout"),
        );
      }
      this.logNetworkDiagnostic("PROVIDER_UNAVAILABLE", error);
      throw new AIProviderRequestError(
        "AI provider is unavailable",
        "PROVIDER_UNAVAILABLE",
        null,
        this.networkMetadata("network.error"),
      );
    }

    const requestId = providerRequestId(response);
    const contentType = response.headers.get("content-type");
    let responseText: string;
    try {
      responseText = await response.text();
    } catch {
      this.throwResponseError(
        "PROVIDER_UNREADABLE_RESPONSE",
        "AI provider response body could not be read",
        response,
        requestId,
        "body.read-error",
        "unreadable response body",
      );
    }

    const trimmed = responseText.trim();
    if (!response.ok) {
      const summary = safeResponseSummary(trimmed, contentType);
      this.throwResponseError(
        "PROVIDER_HTTP_ERROR",
        `AI provider returned HTTP ${response.status}`,
        response,
        requestId,
        "http.error",
        summary,
      );
    }
    if (!trimmed) {
      this.throwResponseError(
        "PROVIDER_EMPTY_RESPONSE",
        "AI provider returned an empty response",
        response,
        requestId,
        "body.empty",
        "empty response body",
      );
    }
    if (
      contentType?.toLowerCase().includes("text/html") ||
      /^\s*<(?:!doctype\s+html|html)\b/iu.test(trimmed)
    ) {
      this.throwResponseError(
        "PROVIDER_UNREADABLE_RESPONSE",
        "AI provider returned HTML instead of JSON",
        response,
        requestId,
        "body.html",
        safeResponseSummary(trimmed, contentType),
      );
    }

    const isEventStream =
      contentType?.toLowerCase().includes("text/event-stream") ||
      /^data:/u.test(trimmed);
    let payload: unknown;
    try {
      payload = JSON.parse(isEventStream ? extractSseJson(trimmed) : trimmed);
    } catch {
      this.throwResponseError(
        "PROVIDER_UNREADABLE_RESPONSE",
        "AI provider returned unreadable JSON",
        response,
        requestId,
        "body.invalid-json",
        safeResponseSummary(trimmed, contentType),
      );
    }
    const providerError = providerErrorSchema.safeParse(payload);
    if (providerError.success) {
      this.throwResponseError(
        "PROVIDER_HTTP_ERROR",
        "AI provider returned an error object",
        response,
        requestId,
        "json.error-object",
        safeResponseSummary(trimmed, contentType),
      );
    }

    let extracted: ExtractedProviderContent;
    try {
      extracted = extractProviderContent(payload, this.endpointType);
    } catch (error) {
      const code =
        error instanceof AIProviderRequestError
          ? error.code
          : "PROVIDER_SCHEMA_INVALID";
      this.throwResponseError(
        code,
        error instanceof Error
          ? error.message
          : "AI provider response schema is incompatible",
        response,
        requestId,
        error instanceof AIProviderRequestError
          ? (error.metadata.parseBranch ?? "envelope.invalid")
          : "envelope.invalid",
        safeResponseSummary(trimmed, contentType),
      );
    }
    if (isEventStream)
      extracted = {
        ...extracted,
        parseBranch: `sse.${extracted.parseBranch}`,
      };
    this.logParsedResponse(response, requestId, extracted.parseBranch, payload);
    return {
      content: extracted.content,
      requestId,
      finishReason: extracted.finishReason,
      parseBranch: extracted.parseBranch,
      usage: extracted.usage,
      responseLength: responseText.length,
    };
  }

  private throwResponseError(
    code: AIProviderErrorCode,
    message: string,
    response: Response,
    requestId: string | null,
    parseBranch: string,
    responseSummary: string,
  ): never {
    const metadata = {
      provider: this.name,
      model: this.model,
      endpointType: this.endpointType,
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      requestId,
      parseBranch,
      responseSummary,
    };
    this.logger.error("[ai-provider-response-failed]", { code, ...metadata });
    throw new AIProviderRequestError(message, code, requestId, metadata);
  }

  private logParsedResponse(
    response: Response,
    requestId: string | null,
    parseBranch: string,
    payload: unknown,
  ) {
    this.logger.info?.("[ai-provider-response-parsed]", {
      provider: this.name,
      model: this.model,
      endpointType: this.endpointType,
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      requestId,
      parseBranch,
      responseSummary: structuralSummary(payload),
    });
  }

  private logNetworkDiagnostic(code: string, error: unknown) {
    this.logger.error("[ai-provider-request-failed]", {
      code,
      ...this.networkMetadata("network.error"),
      responseSummary:
        error instanceof Error ? error.name.slice(0, 100) : "UnknownError",
    });
  }

  private networkMetadata(parseBranch: string) {
    return {
      provider: this.name,
      model: this.model,
      endpointType: this.endpointType,
      httpStatus: null,
      contentType: null,
      requestId: null,
      parseBranch,
    };
  }
}

function endpointFor(baseUrl: string, endpointType: AIEndpointType) {
  const normalized = baseUrl.replace(/\/+$/u, "");
  if (endpointType === "responses")
    return /\/responses$/u.test(normalized)
      ? normalized
      : `${normalized.replace(/\/chat\/completions$/u, "")}/responses`;
  return /\/chat\/completions$/u.test(normalized)
    ? normalized
    : `${normalized.replace(/\/responses$/u, "")}/chat/completions`;
}

function requestBody(
  endpointType: AIEndpointType,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  maxCompletionTokens?: number,
  thinkingMode?: AIThinkingMode,
) {
  if (endpointType === "responses")
    return {
      model,
      temperature: 0.2,
      text: { format: { type: "json_object" } },
      ...(maxCompletionTokens
        ? { max_output_tokens: maxCompletionTokens }
        : {}),
      input: messages,
    };
  return {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    ...(thinkingMode ? { thinking: { type: thinkingMode } } : {}),
    ...(maxCompletionTokens ? { max_tokens: maxCompletionTokens } : {}),
    messages,
  };
}

function extractProviderContent(
  payload: unknown,
  endpointType: AIEndpointType,
): ExtractedProviderContent {
  const extractors =
    endpointType === "responses"
      ? [extractResponsesContent, extractChatContent, extractDirectContent]
      : [extractChatContent, extractResponsesContent, extractDirectContent];
  for (const extractor of extractors) {
    const result = extractor(payload);
    if (result) return result;
  }
  throw new AIProviderRequestError(
    "AI provider response schema is incompatible",
    "PROVIDER_SCHEMA_INVALID",
    null,
    { parseBranch: "envelope.unsupported" },
  );
}

function extractChatContent(payload: unknown): ExtractedProviderContent | null {
  const parsed = chatResponseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const choice = parsed.data.choices[0];
  const candidate =
    choice.message.parsed !== undefined
      ? { value: choice.message.parsed, branch: "chat.message.parsed" }
      : { value: choice.message.content, branch: "chat.message.content" };
  const usage = {
    promptTokens: parsed.data.usage?.prompt_tokens ?? null,
    completionTokens: parsed.data.usage?.completion_tokens ?? null,
    totalTokens: parsed.data.usage?.total_tokens ?? null,
  };
  if (
    isEmptyProviderContent(candidate.value) &&
    choice.finish_reason === "length"
  ) {
    return {
      content: "",
      parseBranch: `${candidate.branch}.truncated`,
      finishReason: choice.finish_reason,
      usage,
    };
  }
  const normalized = normalizeContent(candidate.value, candidate.branch);
  return {
    ...normalized,
    finishReason: choice.finish_reason ?? null,
    usage,
  };
}

function extractResponsesContent(
  payload: unknown,
): ExtractedProviderContent | null {
  const parsed = responsesApiSchema.safeParse(payload);
  if (!parsed.success) return null;
  let candidate: { value: unknown; branch: string } | null = null;
  if (parsed.data.output_text !== undefined)
    candidate = {
      value: parsed.data.output_text,
      branch: "responses.output_text",
    };
  if (!candidate && parsed.data.output) {
    for (const outputItem of parsed.data.output) {
      if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
      for (const part of outputItem.content) {
        if (!isRecord(part)) continue;
        if (part.parsed !== undefined) {
          candidate = {
            value: part.parsed,
            branch: "responses.output.content.parsed",
          };
          break;
        }
        if (part.json !== undefined) {
          candidate = {
            value: part.json,
            branch: "responses.output.content.json",
          };
          break;
        }
        if (part.text !== undefined) {
          candidate = {
            value: part.text,
            branch: "responses.output.content.text",
          };
          break;
        }
      }
      if (candidate) break;
    }
  }
  if (!candidate) return null;
  const normalized = normalizeContent(candidate.value, candidate.branch);
  return {
    ...normalized,
    finishReason: parsed.data.status ?? null,
    usage: {
      promptTokens: parsed.data.usage?.input_tokens ?? null,
      completionTokens: parsed.data.usage?.output_tokens ?? null,
      totalTokens: parsed.data.usage?.total_tokens ?? null,
    },
  };
}

function extractDirectContent(
  payload: unknown,
): ExtractedProviderContent | null {
  if (!isRecord(payload)) return null;
  if (
    ["choices", "output", "output_text", "usage", "object"].some(
      (key) => key in payload,
    )
  )
    return null;
  const value = payload.content !== undefined ? payload.content : payload;
  const branch =
    payload.content !== undefined ? "direct.content" : "direct.object";
  return {
    ...normalizeContent(value, branch),
    finishReason: null,
    usage: {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    },
  };
}

function normalizeContent(
  value: unknown,
  branch: string,
): Pick<ExtractedProviderContent, "content" | "parseBranch"> {
  if (value === null || value === undefined || value === "")
    throw new AIProviderRequestError(
      "AI provider returned empty output content",
      "PROVIDER_EMPTY_RESPONSE",
      null,
      { parseBranch: `${branch}.empty` },
    );
  if (typeof value === "string") {
    const stripped = stripMarkdownFence(value);
    try {
      return {
        content: JSON.parse(stripped),
        parseBranch: `${branch}.json-string`,
      };
    } catch {
      return { content: stripped, parseBranch: `${branch}.text` };
    }
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((part) => (isRecord(part) ? part.text : null))
      .filter((part): part is string => typeof part === "string");
    if (parts.length > 0)
      return normalizeContent(parts.join(""), `${branch}.parts`);
  }
  if (typeof value === "object")
    return { content: value, parseBranch: `${branch}.object` };
  throw new AIProviderRequestError(
    "AI provider output content has an unsupported type",
    "PROVIDER_SCHEMA_INVALID",
    null,
    { parseBranch: `${branch}.unsupported` },
  );
}

function isEmptyProviderContent(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0)
  );
}

function stripMarkdownFence(value: string) {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

function extractSseJson(value: string) {
  const events = value
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  const candidate = events.at(-1);
  if (!candidate)
    throw new SyntaxError("SSE response did not contain a JSON data event");
  return candidate;
}

function providerRequestId(response: Response) {
  return (
    response.headers.get("x-request-id") ??
    response.headers.get("request-id") ??
    response.headers.get("x-trace-id")
  );
}

function safeResponseSummary(value: string, contentType: string | null) {
  const sanitized = value
    .replace(/Bearer\s+\S+/giu, "Bearer [REDACTED]")
    .replace(/(?:sk-|key[-_]?)[A-Za-z0-9_-]{8,}/giu, "[REDACTED]");
  try {
    const payload: unknown = JSON.parse(sanitized);
    const error = providerErrorSchema.safeParse(payload);
    if (error.success) {
      const details = error.data.error;
      return JSON.stringify({
        kind: "error-object",
        type: details.type ?? null,
        code: details.code ?? null,
        message: details.message?.slice(0, 160) ?? null,
      });
    }
    return structuralSummary(payload);
  } catch {
    const prefix = sanitized.slice(0, 240).replace(/\s+/gu, " ");
    return `${contentType ?? "unknown"}; ${prefix}`;
  }
}

function structuralSummary(payload: unknown) {
  if (Array.isArray(payload)) return `JSON array(length=${payload.length})`;
  if (isRecord(payload)) {
    const keys = Object.keys(payload).slice(0, 20).join(",");
    const firstChoice = Array.isArray(payload.choices)
      ? payload.choices.find(isRecord)
      : null;
    const message =
      firstChoice && isRecord(firstChoice.message) ? firstChoice.message : null;
    const contentLength =
      message && typeof message.content === "string"
        ? message.content.length
        : null;
    const reasoningLength =
      message && typeof message.reasoning_content === "string"
        ? message.reasoning_content.length
        : null;
    const finishReason =
      firstChoice && typeof firstChoice.finish_reason === "string"
        ? firstChoice.finish_reason
        : null;
    const choiceSummary = firstChoice
      ? `; finishReason=${finishReason ?? "null"}; contentLength=${contentLength ?? "null"}; reasoningLength=${reasoningLength ?? "null"}`
      : "";
    return `JSON object(keys=${keys})${choiceSummary}`;
  }
  return `JSON ${typeof payload}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
