import { apiError } from "@/lib/api-response";
import {
  getCourseErrorStatus,
  getCourseSafeErrorMessage,
} from "@/services/courses/errors";

export function courseApiError(error: unknown) {
  const status = getCourseErrorStatus(error);
  if (status === 500) {
    console.error("Course API request failed", error);
  }
  return apiError(getCourseSafeErrorMessage(error), status);
}
