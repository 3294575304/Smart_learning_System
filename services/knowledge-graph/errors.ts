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
export function knowledgeGraphErrorCode(error: unknown) {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  )
    return (error as { code: string }).code;
  if (error instanceof Error) {
    if (error.name === "AuthenticationError") return "AUTHENTICATION_REQUIRED";
    if (error.name === "AuthorizationError") return "FORBIDDEN";
    if (error.name === "ResourceNotFoundError") return "RESOURCE_NOT_FOUND";
  }
  return "INTERNAL_ERROR";
}
