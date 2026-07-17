import { ZodError } from "zod";

import {
  DEFAULT_AI_TIMEOUT_MS,
  MAX_AI_ATTEMPTS,
} from "@/services/ai/constants";
import { generateRuleBasedAnalysis } from "@/services/ai/fallback";
import type { AIProvider } from "@/services/ai/provider";
import {
  studentAnalysisOutputSchema,
  type StudentAnalysisInput,
  type StudentAnalysisOutput,
} from "@/services/ai/schemas";

export interface AnalysisExecutionResult {
  output: StudentAnalysisOutput;
  retryCount: number;
  fallbackUsed: boolean;
  errorCode: string | null;
  latencyMs: number;
}

function parseProviderOutput(value: unknown): StudentAnalysisOutput {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return studentAnalysisOutputSchema.parse(parsed);
}

function assertKnownKnowledgePoints(
  output: StudentAnalysisOutput,
  input: StudentAnalysisInput,
): void {
  const knownIds = new Set([
    ...input.answers.flatMap((answer) => answer.knowledgePointIds),
    ...input.historicalKnowledgePointAccuracy.map(
      (item) => item.knowledgePointId,
    ),
  ]);
  const outputIds = [
    ...output.masteredKnowledgePoints.map((item) => item.knowledgePointId),
    ...output.weakKnowledgePoints.map((item) => item.knowledgePointId),
  ];
  const unknownId = outputIds.find((id) => !knownIds.has(id));
  if (unknownId) {
    throw new SyntaxError(`输出包含输入中不存在的知识点：${unknownId}`);
  }
}

function errorDetails(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
  }
  if (error instanceof SyntaxError) return "返回内容不是合法 JSON";
  if (error instanceof Error) return error.message;
  return "未知错误";
}

function errorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "PROVIDER_TIMEOUT";
  }
  if (error instanceof SyntaxError || error instanceof ZodError) {
    return "INVALID_PROVIDER_OUTPUT";
  }
  return "PROVIDER_ERROR";
}

async function executeAttempt(
  provider: AIProvider,
  input: StudentAnalysisInput,
  timeoutMs: number,
  validationError?: string,
): Promise<StudentAnalysisOutput> {
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
    const rawOutput = await Promise.race([
      provider.analyzeStudentPerformance(input, {
        signal: controller.signal,
        validationError,
      }),
      timeout,
    ]);
    const output = parseProviderOutput(rawOutput);
    assertKnownKnowledgePoints(output, input);
    return output;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeStudentPerformance(
  provider: AIProvider,
  input: StudentAnalysisInput,
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
): Promise<AnalysisExecutionResult> {
  const startedAt = Date.now();
  let lastError: unknown;
  let validationError: string | undefined;

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt += 1) {
    try {
      const output = await executeAttempt(
        provider,
        input,
        timeoutMs,
        validationError,
      );
      return {
        output,
        retryCount: attempt,
        fallbackUsed: false,
        errorCode: null,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error: unknown) {
      lastError = error;
      validationError = errorDetails(error);
    }
  }

  return {
    output: generateRuleBasedAnalysis(input),
    retryCount: MAX_AI_ATTEMPTS - 1,
    fallbackUsed: true,
    errorCode: errorCode(lastError),
    latencyMs: Date.now() - startedAt,
  };
}
