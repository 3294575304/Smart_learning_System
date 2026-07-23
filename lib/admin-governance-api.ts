import { apiError } from "@/lib/api-response";
import {
  getGovernanceErrorStatus,
  getGovernanceSafeErrorMessage,
} from "@/services/admin/governance-errors";

export function adminGovernanceApiError(error: unknown) {
  const status = getGovernanceErrorStatus(error);
  if (status === 500) {
    console.error("Admin governance API request failed", error);
  }
  return apiError(getGovernanceSafeErrorMessage(error), status);
}
