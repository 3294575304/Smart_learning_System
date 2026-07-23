import { Role } from "@prisma/client";

import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { adminClassroomListQuerySchema } from "@/services/admin/classrooms/schemas";
import { listAdminClassrooms } from "@/services/admin/classrooms/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const parsed = adminClassroomListQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) return apiError("请检查班级筛选条件", 400);
    return apiSuccess(await listAdminClassrooms(parsed.data));
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}
