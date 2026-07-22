import { Role } from "@prisma/client";

import { apiSuccess } from "@/lib/api-response";
import {
  dashboardApiError,
  privateNoStoreHeaders,
} from "@/services/admin/dashboard/errors";
import { getDashboardOverview } from "@/services/admin/dashboard/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

export async function GET() {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(await getDashboardOverview(), 200, privateNoStoreHeaders);
  } catch (error: unknown) {
    return dashboardApiError(error);
  }
}
