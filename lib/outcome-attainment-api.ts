import { apiError } from "@/lib/api-response";
import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";
import { OutcomeAttainmentError } from "@/services/outcome-attainment/errors";
export function outcomeAttainmentApiError(error: unknown) {
  if (error instanceof OutcomeAttainmentError)
    return apiError(error.message, error.status, undefined, error.code);
  const status = getErrorStatus(error);
  if (status >= 500) console.error("Outcome attainment request failed", error);
  return apiError(getSafeErrorMessage(error), status);
}
