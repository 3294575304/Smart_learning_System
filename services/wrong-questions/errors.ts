import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class WrongQuestionOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 422 = 400,
  ) {
    super(message);
    this.name = "WrongQuestionOperationError";
  }
}

export function getWrongQuestionErrorStatus(error: unknown): number {
  if (error instanceof WrongQuestionOperationError) return error.status;
  return getErrorStatus(error);
}

export function getWrongQuestionSafeErrorMessage(error: unknown): string {
  if (error instanceof WrongQuestionOperationError) return error.message;
  return getSafeErrorMessage(error);
}
