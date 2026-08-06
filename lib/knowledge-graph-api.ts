import { apiError } from "@/lib/api-response";
import {
  knowledgeGraphErrorCode,
  knowledgeGraphErrorStatus,
  knowledgeGraphSafeMessage,
} from "@/services/knowledge-graph/errors";
export function knowledgeGraphApiError(error: unknown) {
  return apiError(
    knowledgeGraphSafeMessage(error),
    knowledgeGraphErrorStatus(error),
    undefined,
    knowledgeGraphErrorCode(error),
  );
}
