import { apiError } from "@/lib/api-response";
import { GradebookOperationError } from "@/services/gradebook/errors";
import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export function gradebookApiError(error: unknown) {
  if (error instanceof GradebookOperationError) {
    if (error.status >= 500) console.error("Gradebook request failed", error);
    return apiError(error.message, error.status, undefined, error.code);
  }
  const status = getErrorStatus(error);
  if (status >= 500) console.error("Gradebook request failed", error);
  return apiError(getSafeErrorMessage(error), status);
}
