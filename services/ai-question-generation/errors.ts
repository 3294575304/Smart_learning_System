import { ZodError } from "zod";

import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";
import { QuestionImportError } from "@/services/question-import/errors";

export class AIQuestionGenerationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "AI_QUESTION_INVALID",
  ) {
    super(message);
    this.name = "AIQuestionGenerationError";
  }
}

export function aiQuestionErrorResponse(error: unknown) {
  if (error instanceof AIQuestionGenerationError)
    return { status: error.status, message: error.message, code: error.code };
  if (error instanceof QuestionImportError)
    return { status: error.status, message: error.message, code: error.code };
  if (error instanceof ZodError)
    return {
      status: 400,
      message: error.issues[0]?.message ?? "参数无效",
      code: "VALIDATION_ERROR",
    };
  const status = getErrorStatus(error);
  if (status === 500) console.error("AI question request failed", error);
  return {
    status,
    message: getSafeErrorMessage(error),
    code: "AI_QUESTION_ERROR",
  };
}
