import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class GovernanceOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 409,
  ) {
    super(message);
    this.name = "GovernanceOperationError";
  }
}

export function getGovernanceErrorStatus(error: unknown): number {
  return error instanceof GovernanceOperationError
    ? error.status
    : getErrorStatus(error);
}

export function getGovernanceSafeErrorMessage(error: unknown): string {
  return error instanceof GovernanceOperationError
    ? error.message
    : getSafeErrorMessage(error);
}
