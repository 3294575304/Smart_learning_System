import { Role } from "@prisma/client";

import { adminUserApiError } from "@/lib/admin-user-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import {
  adminUserIdSchema,
  updateAdminUserSchema,
} from "@/services/admin/users/schemas";
import { getAdminUser, updateAdminUser } from "@/services/admin/users/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";

interface UserRouteContext {
  params: Promise<{ userId: string }>;
}

export async function GET(_: Request, context: UserRouteContext) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const id = adminUserIdSchema.safeParse((await context.params).userId);
    if (!id.success) return apiError("用户 ID 格式无效", 400);
    return apiSuccess(await getAdminUser(id.data));
  } catch (error: unknown) {
    return adminUserApiError(error);
  }
}

export async function PATCH(request: Request, context: UserRouteContext) {
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const id = adminUserIdSchema.safeParse((await context.params).userId);
    if (!id.success) return apiError("用户 ID 格式无效", 400);
    const body: unknown = await request.json().catch(() => null);
    const input = updateAdminUserSchema.safeParse(body);
    if (!input.success) {
      return apiError(
        "请检查用户信息",
        400,
        definedFieldErrors(input.error.flatten().fieldErrors),
      );
    }
    return apiSuccess(
      await updateAdminUser(
        admin.id,
        id.data,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return adminUserApiError(error);
  }
}
