import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  getErrorStatus,
  getSafeErrorMessage,
  requireAuthenticatedUser,
} from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { SystemConfigOperationError } from "@/services/system-config/errors";
import { systemConfigUpdateRequestSchema } from "@/services/system-config/schemas";
import {
  getAdminSystemConfig,
  updateSystemConfig,
} from "@/services/system-config/service";

function configApiError(error: unknown) {
  if (error instanceof SystemConfigOperationError) {
    return apiError(error.message, error.status);
  }
  const status = getErrorStatus(error);
  if (status === 500) console.error("System config API request failed", error);
  return apiError(getSafeErrorMessage(error), status);
}

export async function GET() {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(await getAdminSystemConfig());
  } catch (error: unknown) {
    return configApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("请求内容不是合法 JSON", 400);
    }
    const parsed = systemConfigUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("配置值不符合要求", 422);
    }
    return apiSuccess(
      await updateSystemConfig(
        admin.id,
        parsed.data.updates,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return configApiError(error);
  }
}
