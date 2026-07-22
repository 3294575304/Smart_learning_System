import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class AdminUserOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 409,
  ) {
    super(message);
    this.name = "AdminUserOperationError";
  }
}

export function getAdminUserErrorStatus(error: unknown): number {
  if (error instanceof AdminUserOperationError) return error.status;
  return getErrorStatus(error);
}

export function getAdminUserSafeErrorMessage(error: unknown): string {
  if (error instanceof AdminUserOperationError) return error.message;
  return getSafeErrorMessage(error);
}
