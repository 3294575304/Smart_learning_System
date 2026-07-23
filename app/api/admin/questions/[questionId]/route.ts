import { Role } from "@prisma/client";

import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { adminQuestionIdSchema } from "@/services/admin/questions/schemas";
import { getAdminQuestion } from "@/services/admin/questions/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

interface RouteContext {
  params: Promise<{ questionId: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const parsed = adminQuestionIdSchema.safeParse(
      (await context.params).questionId,
    );
    if (!parsed.success) return apiError("题目 ID 格式无效", 400);
    return apiSuccess(await getAdminQuestion(parsed.data));
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}
