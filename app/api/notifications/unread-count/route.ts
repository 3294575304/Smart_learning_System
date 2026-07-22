import { apiSuccess } from "@/lib/api-response";
import { notificationApiError } from "@/lib/notification-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getUnreadNotificationCount } from "@/services/notifications/service";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    return apiSuccess({ count: await getUnreadNotificationCount(user.id) });
  } catch (error: unknown) {
    return notificationApiError(error);
  }
}
