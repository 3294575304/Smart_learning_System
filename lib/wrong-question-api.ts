import { apiError } from "@/lib/api-response";
import {
  getWrongQuestionErrorStatus,
  getWrongQuestionSafeErrorMessage,
} from "@/services/wrong-questions/errors";

export function wrongQuestionApiError(error: unknown) {
  const status = getWrongQuestionErrorStatus(error);
  return apiError(getWrongQuestionSafeErrorMessage(error), status);
}
