ALTER TYPE "NotificationType" ADD VALUE 'CLASSROOM_DISSOLVED';
ALTER TYPE "NotificationSourceType" ADD VALUE 'CLASSROOM';

ALTER TABLE "Classroom"
ADD COLUMN "dissolvedAt" TIMESTAMP(3),
ADD COLUMN "dissolutionReason" TEXT;
