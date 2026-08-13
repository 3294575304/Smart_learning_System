import { apiError } from "@/lib/api-response";
import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";
import { QualityReportOperationError } from "@/services/quality-reports/errors";

export function qualityReportApiError(error: unknown) {
  if (error instanceof QualityReportOperationError) {
    if (error.status >= 500)
      console.error("Quality report request failed", error);
    return apiError(error.message, error.status, undefined, error.code);
  }
  const status = getErrorStatus(error);
  if (status >= 500) console.error("Quality report request failed", error);
  return apiError(getSafeErrorMessage(error), status);
}
