import { apiError, apiSuccess } from "@/lib/api-response";
import { notificationApiError } from "@/lib/notification-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { notificationListQuerySchema } from "@/services/notifications/schemas";
import { getUserNotifications } from "@/services/notifications/service";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = notificationListQuerySchema.safeParse(query);
    if (!parsed.success) return apiError("请检查通知筛选条件", 400);
    return apiSuccess(await getUserNotifications(user.id, parsed.data));
  } catch (error: unknown) {
    return notificationApiError(error);
  }
}
