import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";

export class AIAnalysisOperationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "AIAnalysisOperationError";
  }
}

export function getAIAnalysisErrorStatus(error: unknown): number {
  if (error instanceof AIAnalysisOperationError) return error.status;
  return getErrorStatus(error);
}

export function getAIAnalysisSafeErrorMessage(error: unknown): string {
  if (error instanceof AIAnalysisOperationError) return error.message;
  const safeMessage = getSafeErrorMessage(error);
  return getErrorStatus(error) === 500
    ? "学情分析服务暂时不可用，请稍后重试"
    : safeMessage;
}
