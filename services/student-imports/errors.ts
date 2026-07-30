import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class StudentImportOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 413 | 500 = 409,
  ) {
    super(message);
    this.name = "StudentImportOperationError";
  }
}

export function getStudentImportErrorStatus(error: unknown): number {
  if (error instanceof StudentImportOperationError) {
    return error.status;
  }

  return getErrorStatus(error);
}

export function getStudentImportSafeErrorMessage(error: unknown): string {
  if (error instanceof StudentImportOperationError) {
    return error.message;
  }

  return getSafeErrorMessage(error);
}
