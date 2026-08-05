import { apiError } from "@/lib/api-response";
import {
  knowledgeGraphErrorStatus,
  knowledgeGraphSafeMessage,
} from "@/services/knowledge-graph/errors";
export function knowledgeGraphApiError(error: unknown) {
  return apiError(
    knowledgeGraphSafeMessage(error),
    knowledgeGraphErrorStatus(error),
  );
}
