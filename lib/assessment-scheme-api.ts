import { apiError } from "@/lib/api-response";
import { AssessmentSchemeOperationError } from "@/services/assessment-schemes/errors";
import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export function assessmentSchemeApiError(error: unknown) {
  if (error instanceof AssessmentSchemeOperationError) {
    if (error.status >= 500)
      console.error("Assessment scheme request failed", error);
    return apiError(error.message, error.status, undefined, error.code);
  }
  const status = getErrorStatus(error);
  if (status >= 500) console.error("Assessment scheme request failed", error);
  return apiError(getSafeErrorMessage(error), status);
}
