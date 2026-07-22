import { ZodError } from "zod";

import { apiError } from "@/lib/api-response";
import {
  getErrorStatus,
  getSafeErrorMessage,
} from "@/services/auth/authorization";

export function dashboardApiError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError("请检查仪表盘查询参数", 400);
  }
  const status = getErrorStatus(error);
  if (status === 500) console.error("Admin dashboard request failed", error);
  return apiError(getSafeErrorMessage(error), status);
}

export const privateNoStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;
