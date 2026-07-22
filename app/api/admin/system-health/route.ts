import { Role } from "@prisma/client";

import { apiSuccess } from "@/lib/api-response";
import {
  dashboardApiError,
  privateNoStoreHeaders,
} from "@/services/admin/dashboard/errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getSystemHealth } from "@/services/system-health/service";

export async function GET() {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(await getSystemHealth(), 200, privateNoStoreHeaders);
  } catch (error: unknown) {
    return dashboardApiError(error);
  }
}
