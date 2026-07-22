-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ANNOUNCEMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNOUNCEMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNOUNCEMENT_PUBLISHED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'ANNOUNCEMENT';

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT_PUBLISHED', 'ASSIGNMENT_DUE_SOON', 'ASSIGNMENT_GRADED', 'LEARNING_ANALYSIS_READY', 'RECOMMENDATION_READY', 'SYSTEM_ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationSourceType" AS ENUM ('ASSIGNMENT', 'SUBMISSION', 'AI_ANALYSIS', 'RECOMMENDATION_CYCLE', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "AnnouncementTargetType" AS ENUM ('ALL', 'ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "NotificationJobType" AS ENUM ('ASSIGNMENT_DUE_REMINDER');

-- CreateEnum
CREATE TYPE "NotificationJobStatus" AS ENUM ('SUCCEEDED', 'PARTIAL_FAILED', 'FAILED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "actionUrl" VARCHAR(500),
    "sourceType" "NotificationSourceType" NOT NULL,
    "sourceId" VARCHAR(128) NOT NULL,
    "deduplicationKey" VARCHAR(191) NOT NULL,
    "readAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Notification_title_check" CHECK (char_length("title") BETWEEN 1 AND 100),
    CONSTRAINT "Notification_content_check" CHECK (char_length("content") BETWEEN 1 AND 2000),
    CONSTRAINT "Notification_actionUrl_check" CHECK ("actionUrl" IS NULL OR ("actionUrl" LIKE '/%' AND "actionUrl" NOT LIKE '//%'))
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "targetType" "AnnouncementTargetType" NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Announcement_title_check" CHECK (char_length("title") BETWEEN 1 AND 100),
    CONSTRAINT "Announcement_content_check" CHECK (char_length("content") BETWEEN 1 AND 2000),
    CONSTRAINT "Announcement_expiresAt_check" CHECK ("expiresAt" IS NULL OR "expiresAt" > "createdAt")
);

-- CreateTable
CREATE TABLE "NotificationJobRun" (
    "id" TEXT NOT NULL,
    "type" "NotificationJobType" NOT NULL,
    "status" "NotificationJobStatus" NOT NULL,
    "scannedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" VARCHAR(500),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationJobRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationJobRun_counts_check" CHECK ("scannedCount" >= 0 AND "createdCount" >= 0 AND "skippedCount" >= 0 AND "failedCount" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientId_deduplicationKey_key" ON "Notification"("recipientId", "deduplicationKey");
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");
CREATE INDEX "Notification_recipientId_readAt_idx" ON "Notification"("recipientId", "readAt");
CREATE INDEX "Notification_expiresAt_idx" ON "Notification"("expiresAt");
CREATE INDEX "Notification_sourceType_sourceId_idx" ON "Notification"("sourceType", "sourceId");
CREATE INDEX "Announcement_status_createdAt_idx" ON "Announcement"("status", "createdAt");
CREATE INDEX "Announcement_targetType_status_idx" ON "Announcement"("targetType", "status");
CREATE INDEX "Announcement_publishedAt_idx" ON "Announcement"("publishedAt");
CREATE INDEX "Announcement_expiresAt_idx" ON "Announcement"("expiresAt");
CREATE INDEX "Announcement_createdById_idx" ON "Announcement"("createdById");
CREATE INDEX "Announcement_publishedById_idx" ON "Announcement"("publishedById");
CREATE INDEX "NotificationJobRun_type_startedAt_idx" ON "NotificationJobRun"("type", "startedAt");
CREATE INDEX "NotificationJobRun_status_startedAt_idx" ON "NotificationJobRun"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
