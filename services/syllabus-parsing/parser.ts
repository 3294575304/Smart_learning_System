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
import type { AIProvider } from "@/services/ai/provider";

export interface SyllabusParseExecution {
  output: SyllabusParseOutput;
  retryCount: number;
  latencyMs: number;
}

function validationDetails(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
  }
  if (error instanceof SyntaxError) return "返回内容不是合法 JSON";
  if (error instanceof DOMException && error.name === "AbortError") {
    return "请求超时";
  }
  return "Provider 返回无效结果";
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
    if (Math.abs(total - 100) > 0.01) {
      warnings.add(`考核方式权重合计为 ${total}%，不是 100%，请教师审核。`);
    }
  }
  const { totalHours, theoryHours, practiceHours } = output.courseInfo;
  if (
    totalHours !== null &&
    theoryHours !== null &&
    practiceHours !== null &&
    Math.abs(theoryHours + practiceHours - totalHours) > 0.01
  ) {
    warnings.add("理论学时与实践学时之和不等于总学时，请教师审核。");
  }
  return { ...output, warnings: [...warnings] };
}

async function parseAttempt(
  provider: AIProvider,
  input: SyllabusParseInput,
  timeoutMs: number,
  validationError?: string,
): Promise<SyllabusParseOutput> {
  const controller = new AbortController();
  let rejectTimeout: ((reason: DOMException) => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectTimeout?.(new DOMException("AI request timed out", "AbortError"));
  }, timeoutMs);
  try {
    const raw = await Promise.race([
      provider.parseSyllabus(input, {
        signal: controller.signal,
        validationError,
      }),
      timeout,
    ]);
    const json: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    return applyDeterministicWarnings(syllabusParseOutputSchema.parse(json));
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
  let lastError: unknown;
  let validationError: string | undefined;
  for (let attempt = 0; attempt < SYLLABUS_MAX_AI_ATTEMPTS; attempt += 1) {
    try {
      return {
        output: await parseAttempt(provider, input, timeoutMs, validationError),
        retryCount: attempt,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error: unknown) {
      lastError = error;
      validationError = validationDetails(error);
    }
  }
  const code =
    lastError instanceof DOMException && lastError.name === "AbortError"
      ? "PROVIDER_TIMEOUT"
      : lastError instanceof SyntaxError || lastError instanceof ZodError
        ? "INVALID_PROVIDER_OUTPUT"
        : "PROVIDER_ERROR";
  throw new SyllabusParseOperationError(
    "教学大纲结构化解析失败，请稍后重试或更换文件。",
    502,
    code,
  );
}
