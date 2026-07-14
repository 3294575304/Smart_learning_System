import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class ClassroomOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 409,
  ) {
    super(message);
    this.name = "ClassroomOperationError";
  }
}

export function getClassroomErrorStatus(error: unknown): number {
  if (error instanceof ClassroomOperationError) {
    return error.status;
  }

  return getErrorStatus(error);
}

export function getClassroomSafeErrorMessage(error: unknown): string {
  if (error instanceof ClassroomOperationError) {
    return error.message;
  }

  return getSafeErrorMessage(error);
}
