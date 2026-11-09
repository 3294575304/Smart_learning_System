import "server-only";

import { prisma } from "@/lib/prisma";
import { withClassroomQuery } from "@/lib/course-classroom";
import { logNotificationFailure } from "@/services/notifications/logging";
import { createNotification } from "@/services/notifications/service";

export async function deliverQualityReportNotifications() {
  // An expired final lease is closed by the generic worker without a domain callback.
  await prisma.courseQualityReport.updateMany({
    where: {
      status: { in: ["QUEUED", "PROCESSING"] },
      backgroundJob: { status: "FAILED" },
    },
    data: {
      status: "FAILED",
      errorCode: "QUALITY_REPORT_GENERATION_FAILED",
      completedAt: new Date(),
      notificationPending: true,
    },
  });
  const reports = await prisma.courseQualityReport.findMany({
    where: { notificationPending: true },
    orderBy: [{ completedAt: "asc" }, { id: "asc" }],
    take: 50,
    select: {
      id: true,
      courseId: true,
      classroomId: true,
      requestedById: true,
      status: true,
      reviewStatus: true,
      versionNumber: true,
      course: { select: { name: true, teacherId: true } },
      classroom: { select: { name: true, teacherId: true, courseId: true } },
      requestedBy: { select: { role: true, status: true, deletedAt: true } },
    },
  });
  for (const report of reports) {
    try {
      await prisma.$transaction(async (transaction) => {
        const claimed = await transaction.courseQualityReport.updateMany({
          where: {
            id: report.id,
            notificationPending: true,
            status: report.status,
            reviewStatus: report.reviewStatus,
          },
          data: { notificationPending: false },
        });
        if (!claimed.count) return;
        if (
          report.course.teacherId !== report.requestedById ||
          report.requestedBy.role !== "TEACHER" ||
          report.requestedBy.status !== "ACTIVE" ||
          report.requestedBy.deletedAt ||
          (report.classroom &&
            (report.classroom.teacherId !== report.requestedById ||
              report.classroom.courseId !== report.courseId))
        )
          return;

        const failed = report.status === "FAILED";
        const ready =
          report.status === "SUCCEEDED" &&
          report.reviewStatus === "PENDING_REVIEW";
        if (!failed && !ready) return;
        const scope = [report.course.name, report.classroom?.name]
          .filter(Boolean)
          .join(" · ");
        await createNotification(
          {
            recipientId: report.requestedById,
            type: "QUALITY_REPORT_RESULT",
            priority: failed ? "IMPORTANT" : "NORMAL",
            expiresAt: null,
            title: failed ? "教学质量报告生成失败" : "教学质量报告初稿待审核",
            content: failed
              ? `${scope} 的报告 v${report.versionNumber} 生成失败。查看生成记录后可重新提交。`
              : `${scope} 的报告 v${report.versionNumber} 初稿已生成。请核对统计、分析文字和改进措施。`,
            actionUrl: withClassroomQuery(
              `/teacher/courses/${report.courseId}/quality-report?reportId=${report.id}`,
              report.classroomId,
            ),
            sourceType: "QUALITY_REPORT",
            sourceId: report.id,
            deduplicationKey: `quality-report:${report.id}:${report.status}`,
          },
          transaction,
        );
      });
    } catch {
      logNotificationFailure("QUALITY_REPORT_RESULT", report.id);
    }
  }
}
