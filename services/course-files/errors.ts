import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class CourseFileOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 413 | 500 = 409,
  ) {
    super(message);
    this.name = "CourseFileOperationError";
  }
}

export function getCourseFileErrorStatus(error: unknown): number {
  if (error instanceof CourseFileOperationError) {
    return error.status;
  }

  return getErrorStatus(error);
}

export function getCourseFileSafeErrorMessage(error: unknown): string {
  if (error instanceof CourseFileOperationError) {
    return error.message;
  }

  return getSafeErrorMessage(error);
}
