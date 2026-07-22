import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
} from "@prisma/client";

import { notificationDeduplication } from "@/services/notifications/deduplication";
import { createNotification } from "@/services/notifications/service";
import { recommendationReadyTemplate } from "@/services/notifications/templates";

export function notifyRecommendationReady(input: {
  recipientId: string;
  cycleKey: string;
  count: number;
  expiresAt: Date | null;
}) {
  return createNotification({
    recipientId: input.recipientId,
    type: NotificationType.RECOMMENDATION_READY,
    ...recommendationReadyTemplate(input),
    priority: NotificationPriority.NORMAL,
    actionUrl: "/student/recommendations",
    sourceType: NotificationSourceType.RECOMMENDATION_CYCLE,
    sourceId: input.cycleKey.slice(0, 128),
    deduplicationKey: notificationDeduplication.recommendationReady(
      input.cycleKey,
    ),
    expiresAt: input.expiresAt,
  });
}
