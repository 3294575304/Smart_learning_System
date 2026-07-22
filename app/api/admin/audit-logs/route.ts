import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  getErrorStatus,
  getSafeErrorMessage,
  requireAuthenticatedUser,
} from "@/services/auth/authorization";
import { auditLogListQuerySchema } from "@/services/audit/schemas";
import { listAuditLogs } from "@/services/audit/service";

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = auditLogListQuerySchema.safeParse(query);
    if (!parsed.success) return apiError("请检查审计日志筛选条件", 400);
    return apiSuccess(await listAuditLogs(parsed.data));
  } catch (error: unknown) {
    const status = getErrorStatus(error);
    if (status === 500) console.error("Audit log API request failed", error);
    return apiError(getSafeErrorMessage(error), status);
  }
}
