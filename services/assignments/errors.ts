import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class AssignmentOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 409,
  ) {
    super(message);
    this.name = "AssignmentOperationError";
  }
}

export function getAssignmentErrorStatus(error: unknown): number {
  if (error instanceof AssignmentOperationError) {
    return error.status;
  }
  return getErrorStatus(error);
}

export function getAssignmentSafeErrorMessage(error: unknown): string {
  if (error instanceof AssignmentOperationError) {
    return error.message;
  }
  return getSafeErrorMessage(error);
}
