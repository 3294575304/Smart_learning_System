import {
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  type Prisma,
} from "@prisma/client";

import { notificationDeduplication } from "@/services/notifications/deduplication";
import { classroomDissolvedTemplate } from "@/services/notifications/templates";
import type { NotificationWriteResult } from "@/services/notifications/types";

export async function notifyClassroomDissolved(
  input: {
    classroomId: string;
    classroomName: string;
    reason: string;
    recipientIds: string[];
  },
  database: Pick<Prisma.TransactionClient, "notification">,
): Promise<NotificationWriteResult> {
  const content = classroomDissolvedTemplate(input);
  const recipientIds = [...new Set(input.recipientIds)];
  if (recipientIds.length === 0) {
    return { createdCount: 0, skippedCount: 0 };
  }
  const result = await database.notification.createMany({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      type: NotificationType.CLASSROOM_DISSOLVED,
      ...content,
      priority: NotificationPriority.IMPORTANT,
      actionUrl: "/notifications",
      sourceType: NotificationSourceType.CLASSROOM,
      sourceId: input.classroomId,
      deduplicationKey: notificationDeduplication.classroomDissolved(
        input.classroomId,
      ),
      expiresAt: null,
    })),
    skipDuplicates: true,
  });
  return {
    createdCount: result.count,
    skippedCount: recipientIds.length - result.count,
  };
}
