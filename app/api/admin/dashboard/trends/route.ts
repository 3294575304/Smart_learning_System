import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  dashboardApiError,
  privateNoStoreHeaders,
} from "@/services/admin/dashboard/errors";
import { dashboardTrendQuerySchema } from "@/services/admin/dashboard/schemas";
import { getDashboardTrends } from "@/services/admin/dashboard/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = dashboardTrendQuerySchema.safeParse(rawQuery);
    if (!parsed.success) return apiError("请检查趋势查询范围", 400);
    return apiSuccess(
      await getDashboardTrends(parsed.data),
      200,
      privateNoStoreHeaders,
    );
  } catch (error: unknown) {
    return dashboardApiError(error);
  }
}
