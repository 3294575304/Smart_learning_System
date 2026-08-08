import { ZodError } from "zod";

import { apiError } from "@/lib/api-response";
import { BackgroundJobError } from "@/services/background-jobs/errors";
import { BackgroundWorkerAuthenticationError } from "@/services/background-jobs/worker-auth";

export function backgroundWorkerRouteError(error: unknown) {
  if (error instanceof BackgroundWorkerAuthenticationError) {
    return apiError(error.message, error.status);
  }
  if (error instanceof BackgroundJobError) {
    return apiError(error.message, error.status, undefined, error.code);
  }
  if (error instanceof ZodError) {
    return apiError("后台任务请求参数无效", 400);
  }
  console.error("Background worker request failed");
  return apiError("后台任务处理失败", 500);
}
