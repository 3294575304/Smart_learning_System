import { apiError, apiSuccess } from "@/lib/api-response";
import { notificationApiError } from "@/lib/notification-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { notificationIdSchema } from "@/services/notifications/schemas";
import { markNotificationRead } from "@/services/notifications/service";

interface Context {
  params: Promise<{ notificationId: string }>;
}

export async function PATCH(_request: Request, context: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const id = notificationIdSchema.safeParse(
      (await context.params).notificationId,
    );
    if (!id.success) return apiError("通知 ID 格式无效", 400);
    return apiSuccess(await markNotificationRead(user.id, id.data));
  } catch (error: unknown) {
    return notificationApiError(error);
  }
}
