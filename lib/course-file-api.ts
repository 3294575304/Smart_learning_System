import { apiError } from "@/lib/api-response";
import {
  getCourseFileErrorStatus,
  getCourseFileSafeErrorMessage,
} from "@/services/course-files/errors";

export function courseFileApiError(error: unknown) {
  const status = getCourseFileErrorStatus(error);
  if (status === 500) {
    console.error("Course file API request failed", error);
  }
  return apiError(getCourseFileSafeErrorMessage(error), status);
}
