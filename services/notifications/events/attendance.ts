import type { Prisma } from "@prisma/client";

import { notificationDeduplication } from "@/services/notifications/deduplication";
import { createNotifications } from "@/services/notifications/service";
import { attendancePublishedTemplate } from "@/services/notifications/templates";
import { studentTaskHref } from "@/services/student-experience/task-scope";

export async function notifyAttendancePublished(
  input: {
    sessionId: string;
    courseId: string;
    classroomId: string;
    courseName: string;
    classroomName: string;
    title: string;
    opensAt: Date;
    closesAt: Date;
    recipientIds: string[];
  },
  transaction: Prisma.TransactionClient,
) {
  const recipients = await transaction.user.findMany({
    where: {
      id: { in: input.recipientIds },
      role: "STUDENT",
      status: "ACTIVE",
    },
    select: { id: true },
  });
  const content = attendancePublishedTemplate(input);
  return createNotifications(
    recipients.map(({ id }) => ({
      recipientId: id,
      type: "ATTENDANCE_PUBLISHED",
      ...content,
      priority: "IMPORTANT",
      actionUrl: studentTaskHref(`/student/attendance/${input.sessionId}`, {
        courseId: input.courseId,
        classroomId: input.classroomId,
      }),
      sourceType: "ATTENDANCE_SESSION",
      sourceId: input.sessionId,
      deduplicationKey: notificationDeduplication.attendancePublished(
        input.sessionId,
      ),
      expiresAt: null,
    })),
    transaction,
  );
}
