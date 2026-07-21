import { z, ZodError } from "zod";

import {
  DEFAULT_AI_TIMEOUT_MS,
  MAX_AI_ATTEMPTS,
} from "@/services/ai/constants";
import type { RecommendationItem } from "@/services/recommendations/types";

const explanationItemSchema = z
  .object({
    questionId: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const explanationOutputSchema = z
  .object({
    items: z.array(explanationItemSchema).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    const questionIds = value.items.map((item) => item.questionId);
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "同一道题不能返回多条推荐说明",
      });
    }
  });

export interface RecommendationExplanationInput {
  items: Array<{
    questionId: string;
    title: string;
    difficulty: number;
    ruleReason: string;
    reasonCodes: string[];
  }>;
}

export interface RecommendationExplanationProvider {
  generateRecommendationReasons(
    input: RecommendationExplanationInput,
    options: { signal: AbortSignal; validationError?: string },
  ): Promise<unknown>;
}

export interface RecommendationReasonEnhancement {
  items: RecommendationItem[];
  enhanced: boolean;
  retryCount: number;
  errorCode: string | null;
}

function parseProviderOutput(value: unknown) {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  return explanationOutputSchema.parse(parsed);
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
  provider: RecommendationExplanationProvider,
  input: RecommendationExplanationInput,
  selectedQuestionIds: Set<string>,
  timeoutMs: number,
  validationError?: string,
): Promise<Map<string, string>> {
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
      provider.generateRecommendationReasons(input, {
        signal: controller.signal,
        validationError,
      }),
      timeout,
    ]);
    const output = parseProviderOutput(rawOutput);
    const unknownQuestionId = output.items.find(
      (item) => !selectedQuestionIds.has(item.questionId),
    )?.questionId;
    if (unknownQuestionId) {
      throw new SyntaxError(`AI 返回了未选中的题目：${unknownQuestionId}`);
    }
    return new Map(output.items.map((item) => [item.questionId, item.reason]));
  } finally {
    clearTimeout(timer);
  }
}

export async function enhanceRecommendationReasons(
  provider: RecommendationExplanationProvider,
  items: RecommendationItem[],
  timeoutMs = DEFAULT_AI_TIMEOUT_MS,
): Promise<RecommendationReasonEnhancement> {
  if (items.length === 0) {
    return { items, enhanced: false, retryCount: 0, errorCode: null };
  }

  const input: RecommendationExplanationInput = {
    items: items.map((item) => ({
      questionId: item.questionId,
      title: item.title,
      difficulty: item.difficulty,
      ruleReason: item.reason,
      reasonCodes: item.reasonCodes,
    })),
  };
  const selectedQuestionIds = new Set(items.map((item) => item.questionId));
  let lastError: unknown;
  let validationError: string | undefined;

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt += 1) {
    try {
      const reasons = await executeAttempt(
        provider,
        input,
        selectedQuestionIds,
        timeoutMs,
        validationError,
      );
      if (reasons.size === 0) {
        throw new SyntaxError("AI 未返回任何有效推荐说明");
      }
      return {
        items: items.map((item) => ({
          ...item,
          reason: reasons.get(item.questionId) ?? item.reason,
        })),
        enhanced: true,
        retryCount: attempt,
        errorCode: null,
      };
    } catch (error: unknown) {
      lastError = error;
      validationError = errorDetails(error);
    }
  }

  return {
    items,
    enhanced: false,
    retryCount: MAX_AI_ATTEMPTS - 1,
    errorCode: errorCode(lastError),
  };
}
