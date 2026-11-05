import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  provisioningApiError,
  refreshSuperAdminPages,
} from "@/lib/super-admin-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { deletePartnerSchool } from "@/services/super-admin/provisioning";
import { partnerSchoolIdSchema } from "@/services/super-admin/provisioning-schemas";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ schoolId: string }> },
) {
  try {
    const actor = await requireAuthenticatedUser([Role.SUPER_ADMIN]);
    const parsed = partnerSchoolIdSchema.safeParse((await params).schoolId);
    if (!parsed.success) return apiError("学校标识无效", 400);
    const result = await deletePartnerSchool(
      actor.id,
      parsed.data,
      auditRequestContext(request),
    );
    refreshSuperAdminPages();
    return apiSuccess(result, 200, { "cache-control": "no-store" });
  } catch (error: unknown) {
    return provisioningApiError(error);
  }
}
