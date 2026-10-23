import { Role } from "@prisma/client";

import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { adminQuestionIdSchema } from "@/services/admin/questions/schemas";
import { restoreAdminQuestion } from "@/services/admin/questions/service";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

interface RouteContext {
  params: Promise<{ questionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const id = adminQuestionIdSchema.safeParse(
      (await context.params).questionId,
    );
    if (!id.success) return apiError("题目 ID 格式无效", 400);
    return apiSuccess(
      await restoreAdminQuestion(
        admin.id,
        id.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}
