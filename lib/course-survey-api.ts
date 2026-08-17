import { apiError } from "@/lib/api-response";
import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";
import { CourseSurveyOperationError } from "@/services/course-surveys/errors";

export function courseSurveyApiError(error: unknown) {
  if (error instanceof CourseSurveyOperationError) {
    if (error.status >= 500)
      console.error("Course survey request failed", error);
    return apiError(error.message, error.status, undefined, error.code);
  }
  const status = getErrorStatus(error);
  if (status >= 500) console.error("Course survey request failed", error);
  return apiError(getSafeErrorMessage(error), status);
}
