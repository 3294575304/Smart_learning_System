import { NotificationType } from "@prisma/client";

export function formatUnreadBadge(count: number): string | null {
  const safeCount = Math.max(0, Math.trunc(count));
  if (safeCount === 0) return null;
  return safeCount > 99 ? "99+" : String(safeCount);
}

export function resolveNotificationDestination(
  type: NotificationType,
  actionUrl: string | null,
): string | null {
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
