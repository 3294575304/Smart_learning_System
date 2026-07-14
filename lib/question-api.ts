import { apiError } from "@/lib/api-response";
import {
  getQuestionErrorStatus,
  getQuestionSafeErrorMessage,
} from "@/services/questions/errors";

export function questionApiError(error: unknown) {
  const status = getQuestionErrorStatus(error);
  if (status === 500) {
    console.error("Question API request failed", error);
  }
  return apiError(getQuestionSafeErrorMessage(error), status);
}
