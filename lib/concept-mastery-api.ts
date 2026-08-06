import { apiError } from "@/lib/api-response";
import {
  conceptMasteryErrorStatus,
  conceptMasterySafeMessage,
} from "@/services/concept-mastery/errors";

export function conceptMasteryApiError(error: unknown) {
  const status = conceptMasteryErrorStatus(error);
  if (status === 500)
    console.error("Concept mastery API request failed", error);
  return apiError(conceptMasterySafeMessage(error), status);
}
