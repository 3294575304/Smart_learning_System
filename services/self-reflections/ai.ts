import { ZodError } from "zod";

import type { AIProvider } from "@/services/ai/provider";
import {
  selfReflectionOutputSchema,
  type SelfReflectionAIInput,
  type SelfReflectionOutput,
} from "@/services/self-reflections/schemas";

export async function structureSelfReflection(
  provider: AIProvider,
  input: SelfReflectionAIInput,
  timeoutMs = 8_000,
): Promise<{ output: SelfReflectionOutput; fallbackUsed: boolean }> {
  if (!provider.structureSelfReflection) return fallback(input);
  let validationError: string | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const raw = await provider.structureSelfReflection(input, {
        signal: controller.signal,
        validationError,
      });
      const output = selfReflectionOutputSchema.parse(
        typeof raw === "string" ? JSON.parse(raw) : raw,
      );
      const known = new Set(input.concepts.map((concept) => concept.id));
      if (output.practiceRequest?.conceptIds.some((id) => !known.has(id)))
        throw new SyntaxError("AI 返回了课程范围外的知识点");
      return { output, fallbackUsed: false };
    } catch (error) {
      validationError =
        error instanceof ZodError
          ? error.issues.map((issue) => issue.message).join("；")
          : error instanceof Error
            ? error.message
            : "输出无效";
    } finally {
      clearTimeout(timer);
    }
  }
  return fallback(input);
}

function fallback(input: SelfReflectionAIInput) {
  const mentioned = input.concepts.filter(
    (concept) =>
      input.text.includes(concept.name) || input.text.includes(concept.code),
  );
  return {
    output: {
      summary: input.text.slice(0, 1_000),
      goals: [],
      difficulties: mentioned.map((concept) => concept.name).slice(0, 20),
      learningHabits: [],
      practiceRequest: mentioned.length
        ? {
            conceptIds: mentioned.map((concept) => concept.id).slice(0, 20),
            questionTypes: [],
            count: 5,
            difficulty: 2,
          }
        : null,
    },
    fallbackUsed: true,
  };
}
