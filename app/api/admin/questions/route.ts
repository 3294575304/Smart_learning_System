import { Role } from "@prisma/client";

import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { adminQuestionListQuerySchema } from "@/services/admin/questions/schemas";
import { listAdminQuestions } from "@/services/admin/questions/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const parsed = adminQuestionListQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) return apiError("请检查题目筛选条件", 400);
    return apiSuccess(await listAdminQuestions(parsed.data));
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}
