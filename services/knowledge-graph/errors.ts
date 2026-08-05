import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class KnowledgeGraphOperationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
    readonly code = "KNOWLEDGE_GRAPH_ERROR",
  ) {
    super(message);
    this.name = "KnowledgeGraphOperationError";
  }
}
export function knowledgeGraphErrorStatus(error: unknown) {
  return error instanceof KnowledgeGraphOperationError ||
    (error instanceof Error && "status" in error)
    ? Number((error as { status: number }).status)
    : getErrorStatus(error);
}
export function knowledgeGraphSafeMessage(error: unknown) {
  return error instanceof KnowledgeGraphOperationError ||
    (error instanceof Error && "status" in error)
    ? error.message
    : getSafeErrorMessage(error);
}
