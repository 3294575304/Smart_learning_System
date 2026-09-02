import { ZodError } from "zod";

import {
  DEFAULT_SYLLABUS_AI_TIMEOUT_MS,
  SYLLABUS_MAX_AI_ATTEMPTS,
} from "@/services/syllabus-parsing/constants";
import { SyllabusParseOperationError } from "@/services/syllabus-parsing/errors";
import { extractObjectiveAssessmentMatrix } from "@/services/syllabus-parsing/objective-assessment-matrix";
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
  validationError: string | null;
}

export interface SyllabusParseExecution {
  output: SyllabusParseOutput;
  retryCount: number;
  latencyMs: number;
  attempts: SyllabusAttemptMetrics[];
}

class SourceReferenceValidationError extends Error {}

class ObjectiveTextValidationError extends Error {}

function normalizedQuote(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function canonicalObjectiveText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "");
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

function verifyObjectiveTextsAreVerbatim(
  output: SyllabusParseOutput,
  input: SyllabusParseInput,
): SyllabusParseOutput {
  let offset = 0;
  const pages = input.pages.map((page) => {
    const text = canonicalObjectiveText(page.text);
    const segment = {
      pageNumber: page.pageNumber,
      start: offset,
      end: offset + text.length,
      text,
    };
    offset = segment.end;
    return segment;
  });
  const documentText = pages.map((page) => page.text).join("");
  output.objectives.forEach((objective, index) => {
    const objectiveText = canonicalObjectiveText(objective.description);
    const sourceStart = documentText.indexOf(objectiveText);
    if (sourceStart < 0) {
      throw new ObjectiveTextValidationError(
        `objectives.${index}.description 必须完整复现 PDF 原文，不得摘要或改写`,
      );
    }
    const sourceEnd = sourceStart + objectiveText.length;
    const sourcePages = pages
      .filter((page) => page.end > sourceStart && page.start < sourceEnd)
      .map((page) => page.pageNumber);
    objective.sourceRefs = sourcePages.map((page) => {
      const existing = objective.sourceRefs.find(
        (reference) => reference.page === page,
      );
      return existing ?? { page, verified: false };
    });
  });
  return output;
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
  if (output.assessments.length > 0 && output.objectives.length > 0) {
    const expected = output.assessments.length * output.objectives.length;
    const numeric = output.objectiveAssessmentMappings.filter(
      (item) => item.allocationRate !== null,
    ).length;
    if (numeric !== expected) {
      warnings.add(
        `课程目标—考核方式占比仅提取 ${numeric}/${expected} 个数值；生成课程目标达成度前请在大纲审核页补齐。`,
      );
    }
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
  const practiceItemHours = output.practiceItems.map(
    (item) => item.suggestedHours,
  );
  if (
    practiceHours !== null &&
    practiceItemHours.length > 0 &&
    practiceItemHours.every((hours) => hours !== null)
  ) {
    const itemTotal = practiceItemHours.reduce<number>(
      (sum, hours) => sum + (hours ?? 0),
      0,
    );
    if (Math.abs(itemTotal - practiceHours) > 0.01) {
      warnings.add(
        `Practice item hours total ${itemTotal}, not ${practiceHours}; teacher review required.`,
      );
    }
  }
  if (output.courseInfo.credits === null) {
    warnings.add(
      "未提取到学分；生成教学质量报告前请对照大纲补充并发布审核修订。",
    );
  }
  if (!output.courseInfo.courseNature) {
    warnings.add(
      "未提取到课程性质；生成教学质量报告前请对照大纲补充并发布审核修订。",
    );
  }
  if (!output.courseInfo.teachingCollege) {
    warnings.add("未提取到授课学院；教学质量报告封面需要教师确认学院信息。");
  }
  if (!output.courseInfo.applicableMajors) {
    warnings.add("未提取到适用专业；教学质量报告封面需要教师确认专业信息。");
  }
  return { ...output, warnings: [...warnings] };
}

function enrichObjectiveAssessmentMatrix(
  output: SyllabusParseOutput,
  input: SyllabusParseInput,
): SyllabusParseOutput {
  const extracted = extractObjectiveAssessmentMatrix(
    input.pages,
    output.objectives.length,
    output.assessments.length,
  );
  if (!extracted) return output;
  const sourceRefs = extracted.sourcePages.map((page, index) => ({
    page,
    ...(index === 0 ? { quote: "课程目标在各考核方式中占比" } : {}),
    verified: false,
  }));
  return {
    ...output,
    objectiveAssessmentMappings: output.objectives.flatMap(
      (objective, objectiveIndex) =>
        output.assessments.map((assessment, assessmentIndex) => ({
          objectiveCode: objective.code,
          assessmentCode: assessment.code,
          allocationRate:
            extracted.values[
              objectiveIndex * output.assessments.length + assessmentIndex
            ] ?? null,
          sourceRefs,
        })),
    ),
  };
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
  if (error instanceof ObjectiveTextValidationError) return error.message;
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
      validationError: null,
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
        metrics.validationError =
          "Provider output reached the completion-token limit.";
        attempts.push(metrics);
        if (index + 1 < SYLLABUS_MAX_AI_ATTEMPTS) {
          validationError =
            "上一次输出因长度限制被截断。请显著压缩描述，只保留页码引用，不输出 quote，优先保证完整 JSON 闭合和全部必填键。";
          continue;
        }
        throw new SyllabusParseOperationError(
          "AI output was truncated after two compact repair attempts.",
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
        metrics.validationError = validationDetails(error);
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
          verifySourceReferences(
            verifyObjectiveTextsAreVerbatim(
              enrichObjectiveAssessmentMatrix(
                syllabusParseOutputSchema.parse(json),
                input,
              ),
              input,
            ),
            input,
          ),
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
        metrics.validationError = validationDetails(error);
        attempts.push(metrics);
        if (index + 1 < SYLLABUS_MAX_AI_ATTEMPTS) {
          validationError = validationDetails(error);
          continue;
        }
        throw new SyllabusParseOperationError(
          "AI 输出未通过结构校验，教学大纲结构化解析失败。",
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
      if (
        code === "PROVIDER_EMPTY_RESPONSE" &&
        index + 1 < SYLLABUS_MAX_AI_ATTEMPTS
      ) {
        validationError =
          "Provider returned empty content. Return the complete JSON object directly.";
        continue;
      }
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
