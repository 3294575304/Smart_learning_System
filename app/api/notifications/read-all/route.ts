import { apiSuccess } from "@/lib/api-response";
import { notificationApiError } from "@/lib/notification-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { markAllNotificationsRead } from "@/services/notifications/service";

export async function POST() {
  try {
    const user = await requireAuthenticatedUser();
    return apiSuccess(await markAllNotificationsRead(user.id));
  } catch (error: unknown) {
    return notificationApiError(error);
  }
}
