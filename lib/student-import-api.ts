import { apiError } from "@/lib/api-response";
import {
  getStudentImportErrorStatus,
  getStudentImportSafeErrorMessage,
} from "@/services/student-imports/errors";

export function studentImportApiError(error: unknown) {
  const status = getStudentImportErrorStatus(error);
  if (status === 500) {
    console.error("Student import API request failed", error);
  }
  return apiError(getStudentImportSafeErrorMessage(error), status);
}
