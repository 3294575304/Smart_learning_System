import { Role } from "@prisma/client";
import { apiSuccess } from "@/lib/api-response";
import {
  provisioningApiError,
  refreshSuperAdminPages,
} from "@/lib/super-admin-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { deleteSchoolAdmin } from "@/services/super-admin/provisioning";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ adminId: string }> },
) {
  try {
    const actor = await requireAuthenticatedUser([Role.SUPER_ADMIN]);
    const result = await deleteSchoolAdmin(
      actor.id,
      (await params).adminId,
      auditRequestContext(request),
    );
    refreshSuperAdminPages();
    return apiSuccess(result, 200, { "cache-control": "no-store" });
  } catch (error: unknown) {
    return provisioningApiError(error);
  }
}
