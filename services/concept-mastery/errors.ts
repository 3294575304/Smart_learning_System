import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class ConceptMasteryOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 500 = 409,
  ) {
    super(message);
    this.name = "ConceptMasteryOperationError";
  }
}

export class ConceptMasteryConcurrencyError extends Error {
  constructor() {
    super("Concept mastery revision changed concurrently");
    this.name = "ConceptMasteryConcurrencyError";
  }
}

export function conceptMasteryErrorStatus(error: unknown): number {
  return error instanceof ConceptMasteryOperationError
    ? error.status
    : getErrorStatus(error);
}

export function conceptMasterySafeMessage(error: unknown): string {
  return error instanceof ConceptMasteryOperationError
    ? error.message
    : getSafeErrorMessage(error);
}
