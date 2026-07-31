import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class SyllabusParseOperationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
    readonly code = "SYLLABUS_PARSE_ERROR",
  ) {
    super(message);
    this.name = "SyllabusParseOperationError";
  }
}

export function syllabusParseErrorStatus(error: unknown): number {
  if (error instanceof SyllabusParseOperationError) return error.status;
  return getErrorStatus(error);
}

export function syllabusParseSafeMessage(error: unknown): string {
  if (error instanceof SyllabusParseOperationError) return error.message;
  const status = getErrorStatus(error);
  return status === 500
    ? "教学大纲解析服务暂时不可用，请稍后重试。"
    : getSafeErrorMessage(error);
}
