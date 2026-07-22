import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  dashboardApiError,
  privateNoStoreHeaders,
} from "@/services/admin/dashboard/errors";
import { dashboardActivityQuerySchema } from "@/services/admin/dashboard/schemas";
import { getDashboardActivities } from "@/services/admin/dashboard/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = dashboardActivityQuerySchema.safeParse(rawQuery);
    if (!parsed.success) return apiError("请检查动态查询条件", 400);
    return apiSuccess(
      await getDashboardActivities(parsed.data),
      200,
      privateNoStoreHeaders,
    );
  } catch (error: unknown) {
    return dashboardApiError(error);
  }
}
