import { NotificationType } from "@prisma/client";
import type { NotificationListItem } from "@/services/notifications/types";

export function notificationDetailsHref(
  item: Pick<NotificationListItem, "id" | "type" | "action">,
): string | null {
  if (item.type === NotificationType.ATTENDANCE_PUBLISHED)
    return item.action?.kind === "LINK"
      ? resolveNotificationDestination(item.type, item.action.href)
      : null;
  return `/notifications/${encodeURIComponent(item.id)}`;
}

export function formatUnreadBadge(count: number): string | null {
  const safeCount = Math.max(0, Math.trunc(count));
  if (safeCount === 0) return null;
  return safeCount > 99 ? "99+" : String(safeCount);
}

export function resolveNotificationDestination(
  type: NotificationType,
  actionUrl: string | null,
): string | null {
  if (
    actionUrl &&
    (!actionUrl.startsWith("/") ||
      actionUrl.startsWith("//") ||
      actionUrl.includes("\\") ||
      /[\u0000-\u001f\u007f]/u.test(actionUrl))
  )
    return null;
  switch (type) {
    case NotificationType.ASSIGNMENT_PUBLISHED:
    case NotificationType.ASSIGNMENT_DUE_SOON:
      return "/student/assignments";
    case NotificationType.COURSE_SURVEY_PUBLISHED:
      return "/student/surveys";
    default:
      return actionUrl;
  }
}
