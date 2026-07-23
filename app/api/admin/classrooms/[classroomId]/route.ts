import { Role } from "@prisma/client";

import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { adminClassroomIdSchema } from "@/services/admin/classrooms/schemas";
import { getAdminClassroom } from "@/services/admin/classrooms/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const id = adminClassroomIdSchema.safeParse(
      (await context.params).classroomId,
    );
    if (!id.success) return apiError("班级 ID 格式无效", 400);
    return apiSuccess(await getAdminClassroom(id.data));
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}
