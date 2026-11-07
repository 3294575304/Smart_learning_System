import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import {
  provisioningApiError,
  refreshSuperAdminPages,
} from "@/lib/super-admin-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { updateSchoolAdmin } from "@/services/super-admin/provisioning";
import { updateSchoolAdminSchema } from "@/services/super-admin/provisioning-schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ adminId: string }> },
) {
  try {
    const actor = await requireAuthenticatedUser([Role.SUPER_ADMIN]);
    const parsed = updateSchoolAdminSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return apiError(
        "请检查管理员账号信息",
        400,
        definedFieldErrors(parsed.error.flatten().fieldErrors),
      );
    const result = await updateSchoolAdmin(
      actor.id,
      (await params).adminId,
      parsed.data,
      auditRequestContext(request),
    );
    refreshSuperAdminPages();
    return apiSuccess(result, 200, { "cache-control": "no-store" });
  } catch (error: unknown) {
    return provisioningApiError(error);
  }
}
