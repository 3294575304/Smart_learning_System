import { apiError } from "@/lib/api-response";
import {
  graphBindingErrorStatus,
  graphBindingSafeMessage,
} from "@/services/question-graph-bindings/errors";

export function questionGraphBindingApiError(error: unknown) {
  const status = graphBindingErrorStatus(error);
  if (status === 500)
    console.error("Question graph binding API request failed", error);
  return apiError(graphBindingSafeMessage(error), status);
}
