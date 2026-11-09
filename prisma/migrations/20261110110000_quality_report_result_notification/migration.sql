ALTER TYPE "NotificationType" ADD VALUE 'QUALITY_REPORT_RESULT';
ALTER TYPE "NotificationSourceType" ADD VALUE 'QUALITY_REPORT';

ALTER TABLE "CourseQualityReport"
ADD COLUMN "notificationPending" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "CourseQualityReport_notificationPending_completedAt_idx"
ON "CourseQualityReport" ("notificationPending", "completedAt");
