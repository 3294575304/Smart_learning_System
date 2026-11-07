import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { notificationApiError } from "@/lib/notification-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  notificationDismissSchema,
  notificationListQuerySchema,
} from "@/services/notifications/schemas";
import {
  dismissUserNotifications,
  getUserNotifications,
} from "@/services/notifications/service";

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

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER, Role.STUDENT]);
    const parsed = notificationDismissSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return apiError("请检查要删除的通知", 400);
    return apiSuccess(await dismissUserNotifications(user.id, parsed.data));
  } catch (error: unknown) {
    return notificationApiError(error);
  }
}
