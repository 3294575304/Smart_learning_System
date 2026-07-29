import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class CourseOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 413 | 500 = 409,
  ) {
    super(message);
    this.name = "CourseOperationError";
  }
}

export function getCourseErrorStatus(error: unknown): number {
  if (error instanceof CourseOperationError) {
    return error.status;
  }

  return getErrorStatus(error);
}

export function getCourseSafeErrorMessage(error: unknown): string {
  if (error instanceof CourseOperationError) {
    return error.message;
  }

  return getSafeErrorMessage(error);
}
