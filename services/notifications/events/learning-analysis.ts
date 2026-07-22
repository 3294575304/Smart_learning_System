import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
} from "@prisma/client";

import { notificationDeduplication } from "@/services/notifications/deduplication";
import { createNotification } from "@/services/notifications/service";
import { learningAnalysisReadyTemplate } from "@/services/notifications/templates";

export function notifyLearningAnalysisReady(input: {
  recipientId: string;
  analysisId: string;
}) {
  return createNotification({
    recipientId: input.recipientId,
    type: NotificationType.LEARNING_ANALYSIS_READY,
    ...learningAnalysisReadyTemplate(),
    priority: NotificationPriority.NORMAL,
    actionUrl: "/student/analytics",
    sourceType: NotificationSourceType.AI_ANALYSIS,
    sourceId: input.analysisId,
    deduplicationKey: notificationDeduplication.learningAnalysisReady(
      input.analysisId,
    ),
    expiresAt: null,
  });
}
