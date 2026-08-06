import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class QuestionGraphBindingError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 400,
  ) {
    super(message);
    this.name = "QuestionGraphBindingError";
  }
}

export function graphBindingErrorStatus(error: unknown): number {
  return error instanceof QuestionGraphBindingError
    ? error.status
    : getErrorStatus(error);
}

export function graphBindingSafeMessage(error: unknown): string {
  return error instanceof QuestionGraphBindingError
    ? error.message
    : getSafeErrorMessage(error);
}
