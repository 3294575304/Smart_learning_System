import { Role } from "@prisma/client";

import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  adminQuestionIdSchema,
  disableAdminQuestionSchema,
} from "@/services/admin/questions/schemas";
import { disableAdminQuestion } from "@/services/admin/questions/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";

interface RouteContext {
  params: Promise<{ questionId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const id = adminQuestionIdSchema.safeParse(
      (await context.params).questionId,
    );
    if (!id.success) return apiError("题目 ID 格式无效", 400);
    const body: unknown = await request.json().catch(() => null);
    if (!disableAdminQuestionSchema.safeParse(body).success) {
      return apiError("题目状态参数无效", 400);
    }
    return apiSuccess(
      await disableAdminQuestion(
        admin.id,
        id.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}
