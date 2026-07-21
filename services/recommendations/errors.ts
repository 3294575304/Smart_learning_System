import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class RecommendationOperationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 422 = 400,
  ) {
    super(message);
    this.name = "RecommendationOperationError";
  }
}

export function getRecommendationErrorStatus(error: unknown): number {
  if (error instanceof RecommendationOperationError) return error.status;
  return getErrorStatus(error);
}

export function getRecommendationSafeErrorMessage(error: unknown): string {
  if (error instanceof RecommendationOperationError) return error.message;
  return getSafeErrorMessage(error);
}
