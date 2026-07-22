import { Role } from "@prisma/client";

import { adminUserApiError } from "@/lib/admin-user-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import {
  adminUserListQuerySchema,
  createAdminUserSchema,
} from "@/services/admin/users/schemas";
import {
  createAdminUser,
  listAdminUsers,
} from "@/services/admin/users/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = adminUserListQuerySchema.safeParse(query);
    if (!parsed.success) return apiError("请检查用户筛选条件", 400);
    return apiSuccess(await listAdminUsers(parsed.data));
  } catch (error: unknown) {
    return adminUserApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const body: unknown = await request.json().catch(() => null);
    const parsed = createAdminUserSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "请检查用户信息",
        400,
        definedFieldErrors(parsed.error.flatten().fieldErrors),
      );
    }
    return apiSuccess(
      await createAdminUser(
        admin.id,
        parsed.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return adminUserApiError(error);
  }
}
