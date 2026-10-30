import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { practiceManagementSchema } from "@/services/practice-sets/management-schemas";
import { managePracticeSet } from "@/services/practice-sets/management";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAuthenticatedUser([Role.STUDENT]);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("请求内容无效", 400);
    }
    const parsed = practiceManagementSchema.safeParse(body);
    if (!parsed.success) return apiError("练习管理参数无效", 400);
    return apiSuccess(
      await managePracticeSet(actor, (await context.params).id, parsed.data),
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
