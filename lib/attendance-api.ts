import { apiError } from "@/lib/api-response";
import { AttendanceOperationError } from "@/services/attendance/errors";
import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export function attendanceApiError(error: unknown) {
  if (error instanceof AttendanceOperationError)
    return apiError(error.message, error.status, undefined, error.code);
  const status = getErrorStatus(error);
  if (status >= 500) console.error("Attendance request failed", error);
  return apiError(getSafeErrorMessage(error), status);
}
