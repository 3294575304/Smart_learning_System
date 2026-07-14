import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class QuestionOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 400,
  ) {
    super(message);
    this.name = "QuestionOperationError";
  }
}

export function getQuestionErrorStatus(error: unknown): number {
  if (error instanceof QuestionOperationError) {
    return error.status;
  }
  return getErrorStatus(error);
}

export function getQuestionSafeErrorMessage(error: unknown): string {
  if (error instanceof QuestionOperationError) {
    return error.message;
  }
  return getSafeErrorMessage(error);
}
