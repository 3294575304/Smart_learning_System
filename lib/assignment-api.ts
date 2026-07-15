import { apiError } from "@/lib/api-response";
import {
  getAssignmentErrorStatus,
  getAssignmentSafeErrorMessage,
} from "@/services/assignments/errors";

export function assignmentApiError(error: unknown) {
  const status = getAssignmentErrorStatus(error);
  if (status === 500) {
    console.error("Assignment API request failed", error);
  }
  return apiError(getAssignmentSafeErrorMessage(error), status);
}
