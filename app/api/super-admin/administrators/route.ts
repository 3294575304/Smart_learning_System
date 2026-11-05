import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import {
  provisioningApiError,
  refreshSuperAdminPages,
} from "@/lib/super-admin-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { createSchoolAdmin } from "@/services/super-admin/provisioning";
import { createSchoolAdminSchema } from "@/services/super-admin/provisioning-schemas";

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedUser([Role.SUPER_ADMIN]);
    const parsed = createSchoolAdminSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return apiError(
        "请检查管理员信息",
        400,
        definedFieldErrors(parsed.error.flatten().fieldErrors),
      );
    const result = await createSchoolAdmin(
      actor.id,
      parsed.data,
      auditRequestContext(request),
    );
    refreshSuperAdminPages();
    return apiSuccess(result, 201, { "cache-control": "no-store" });
  } catch (error: unknown) {
    return provisioningApiError(error);
  }
}
