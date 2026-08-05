import { ZodError } from "zod";

import {
  DEFAULT_SYLLABUS_AI_TIMEOUT_MS,
  SYLLABUS_MAX_AI_ATTEMPTS,
} from "@/services/syllabus-parsing/constants";
import { SyllabusParseOperationError } from "@/services/syllabus-parsing/errors";
import {
  syllabusParseOutputSchema,
  type SyllabusParseInput,
  type SyllabusParseOutput,
} from "@/services/syllabus-parsing/schemas";
import {
  AIProviderRequestError,
  type AIProvider,
  type AIProviderResponse,
} from "@/services/ai/provider";

export type SyllabusErrorPhase = "provider" | "json" | "validation" | "job";

export interface SyllabusAttemptMetrics {
  attempt: number;
  providerRequestId: string | null;
  providerDurationMs: number;
  jsonParseDurationMs: number;
  validationDurationMs: number;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  responseLength: number;
  errorPhase: SyllabusErrorPhase | null;
}

export interface SyllabusParseExecution {
  output: SyllabusParseOutput;
  retryCount: number;
  latencyMs: number;
  attempts: SyllabusAttemptMetrics[];
}

class SourceReferenceValidationError extends Error {}

function normalizedQuote(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function verifySourceReferences(
  output: SyllabusParseOutput,
  input: SyllabusParseInput,
) {
  const pageText = new Map(
    input.pages.map((page) => [page.pageNumber, normalizedQuote(page.text)]),
  );
  let unverifiedQuoteCount = 0;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.sourceRefs)) {
      for (const candidate of record.sourceRefs) {
        if (!candidate || typeof candidate !== "object") continue;
        const source = candidate as Record<string, unknown>;
        const page = typeof source.page === "number" ? source.page : 0;
        const text = pageText.get(page);
        if (!text)
          throw new SourceReferenceValidationError(
            `sourceRefs references missing page ${page}`,
          );
        const quote =
          typeof source.quote === "string"
            ? normalizedQuote(source.quote)
            : null;
        source.verified = quote ? text.includes(quote) : false;
        if (quote && !source.verified) unverifiedQuoteCount += 1;
      }
    }
    Object.values(record).forEach(visit);
  };
  const verified = structuredClone(output);
  visit(verified);
  if (unverifiedQuoteCount > 0) {
    verified.warnings = [
      ...new Set([
        ...verified.warnings,
        `${unverifiedQuoteCount} source quotations could not be verified; review against the PDF.`,
      ]),
    ];
  }
  return verified;
}

function applyDeterministicWarnings(
  output: SyllabusParseOutput,
): SyllabusParseOutput {
  const warnings = new Set(output.warnings);
  const weights = output.assessments.map((item) => item.weight);
  if (weights.length > 0 && weights.every((weight) => weight !== null)) {
    const total = weights.reduce<number>(
      (sum, weight) => sum + (weight ?? 0),
      0,
    );
    if (Math.abs(total - 100) > 0.01)
      warnings.add(
        `Assessment weights total ${total}%, not 100%; teacher review required.`,
      );
  }
  const { totalHours, theoryHours, practiceHours } = output.courseInfo;
  if (
    totalHours !== null &&
    theoryHours !== null &&
    practiceHours !== null &&
    Math.abs(theoryHours + practiceHours - totalHours) > 0.01
  ) {
    warnings.add(
      "Theory and practice hours do not equal total hours; teacher review required.",
    );
  }
  return { ...output, warnings: [...warnings] };
}

function responseEnvelope(raw: unknown): AIProviderResponse {
  if (raw && typeof raw === "object" && "content" in raw && "usage" in raw)
    return raw as AIProviderResponse;
  const responseLength =
    typeof raw === "string" ? raw.length : (JSON.stringify(raw)?.length ?? 0);
  return {
    content: raw,
    requestId: null,
    finishReason: null,
    usage: { promptTokens: null, completionTokens: null, totalTokens: null },
    responseLength,
  };
}

function validationDetails(error: unknown): string {
  if (error instanceof ZodError)
    return error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
  if (error instanceof SyntaxError) return "Response was not valid JSON";
  if (error instanceof SourceReferenceValidationError) return error.message;
  return "Provider returned invalid output";
}

async function providerCall(
  provider: AIProvider,
  input: SyllabusParseInput,
  timeoutMs: number,
  validationError?: string,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return responseEnvelope(
      await provider.parseSyllabus(input, {
        signal: controller.signal,
        validationError,
      }),
    );
  } catch (error: unknown) {
    if (
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new AIProviderRequestError(
        "AI provider request timed out",
        "PROVIDER_TIMEOUT",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseSyllabusStructure(
  provider: AIProvider,
  input: SyllabusParseInput,
  timeoutMs = DEFAULT_SYLLABUS_AI_TIMEOUT_MS,
): Promise<SyllabusParseExecution> {
  const startedAt = Date.now();
  const attempts: SyllabusAttemptMetrics[] = [];
  let validationError: string | undefined;
  for (let index = 0; index < SYLLABUS_MAX_AI_ATTEMPTS; index += 1) {
    const metrics: SyllabusAttemptMetrics = {
      attempt: index + 1,
      providerRequestId: null,
      providerDurationMs: 0,
      jsonParseDurationMs: 0,
      validationDurationMs: 0,
      finishReason: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      responseLength: 0,
      errorPhase: null,
    };
    try {
      const providerStartedAt = Date.now();
      let response: AIProviderResponse;
      try {
        response = await providerCall(
          provider,
          input,
          timeoutMs,
          validationError,
        );
      } finally {
        metrics.providerDurationMs = Date.now() - providerStartedAt;
      }
      Object.assign(metrics, {
        providerRequestId: response.requestId,
        finishReason: response.finishReason,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        responseLength: response.responseLength,
      });
      if (response.finishReason === "length") {
        metrics.errorPhase = "provider";
        attempts.push(metrics);
        throw new SyllabusParseOperationError(
          "AI output was truncated. Please retry explicitly.",
          502,
          "AI_OUTPUT_TRUNCATED",
          { attempts },
        );
      }
      const jsonStartedAt = Date.now();
      let json: unknown;
      try {
        json =
          typeof response.content === "string"
            ? JSON.parse(response.content)
            : response.content;
      } catch (error: unknown) {
        metrics.jsonParseDurationMs = Date.now() - jsonStartedAt;
        metrics.errorPhase = "json";
        attempts.push(metrics);
        if (index + 1 < SYLLABUS_MAX_AI_ATTEMPTS) {
          validationError = validationDetails(error);
          continue;
        }
        throw new SyllabusParseOperationError(
          "AI returned invalid JSON.",
          502,
          "INVALID_AI_JSON",
          { attempts },
        );
      }
      metrics.jsonParseDurationMs = Date.now() - jsonStartedAt;
      const validationStartedAt = Date.now();
      try {
        const output = applyDeterministicWarnings(
          verifySourceReferences(syllabusParseOutputSchema.parse(json), input),
        );
        metrics.validationDurationMs = Date.now() - validationStartedAt;
        attempts.push(metrics);
        return {
          output,
          retryCount: index,
          latencyMs: Date.now() - startedAt,
          attempts,
        };
      } catch (error: unknown) {
        metrics.validationDurationMs = Date.now() - validationStartedAt;
        metrics.errorPhase = "validation";
        attempts.push(metrics);
        if (index + 1 < SYLLABUS_MAX_AI_ATTEMPTS) {
          validationError = validationDetails(error);
          continue;
        }
        throw new SyllabusParseOperationError(
          "AI output failed schema validation.",
          502,
          "INVALID_AI_OUTPUT",
          { attempts },
        );
      }
    } catch (error: unknown) {
      if (error instanceof SyllabusParseOperationError) throw error;
      metrics.errorPhase = "provider";
      if (!attempts.includes(metrics)) attempts.push(metrics);
      const code =
        error instanceof AIProviderRequestError
          ? error.code
          : "PROVIDER_UNAVAILABLE";
      throw new SyllabusParseOperationError(
        "AI provider request failed.",
        502,
        code,
        { attempts },
      );
    }
  }
  throw new SyllabusParseOperationError(
    "Syllabus parsing was interrupted.",
    500,
    "JOB_INTERRUPTED",
    { attempts },
  );
}
