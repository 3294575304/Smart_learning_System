import { NotificationCenter } from "@/components/notifications/notification-center";
import { requireAuthenticatedPageUser } from "@/services/auth/page-authorization";
import { notificationListQuerySchema } from "@/services/notifications/schemas";
import { getUserNotifications } from "@/services/notifications/service";

export default async function NotificationsPage() {
  const user = await requireAuthenticatedPageUser();
  const result = await getUserNotifications(
    user.id,
    notificationListQuerySchema.parse({}),
  );
  return <NotificationCenter initialResult={result} />;
}
