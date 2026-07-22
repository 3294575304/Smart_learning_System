-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SYSTEM_CONFIG_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MAINTENANCE_MODE_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'MAINTENANCE_MODE_DISABLED';
ALTER TYPE "AuditAction" ADD VALUE 'AI_FEATURE_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'AI_FEATURE_DISABLED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'SYSTEM_CONFIG';

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'default',
    "platformName" TEXT NOT NULL DEFAULT '智学课堂',
    "platformAnnouncement" TEXT NOT NULL DEFAULT '',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT NOT NULL DEFAULT '系统维护中，请稍后再试。',
    "allowSelfRegistration" BOOLEAN NOT NULL DEFAULT true,
    "assignmentDefaultDueDays" INTEGER NOT NULL DEFAULT 7,
    "assignmentAutosaveDelayMs" INTEGER NOT NULL DEFAULT 900,
    "aiAnalysisEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SystemConfig_singletonKey_check" CHECK ("singletonKey" = 'default'),
    CONSTRAINT "SystemConfig_platformName_check" CHECK (char_length("platformName") BETWEEN 1 AND 50),
    CONSTRAINT "SystemConfig_platformAnnouncement_check" CHECK (char_length("platformAnnouncement") <= 2000),
    CONSTRAINT "SystemConfig_maintenanceMessage_check" CHECK (char_length("maintenanceMessage") BETWEEN 1 AND 500),
    CONSTRAINT "SystemConfig_assignmentDefaultDueDays_check" CHECK ("assignmentDefaultDueDays" BETWEEN 1 AND 365),
    CONSTRAINT "SystemConfig_assignmentAutosaveDelayMs_check" CHECK ("assignmentAutosaveDelayMs" BETWEEN 500 AND 10000)
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_singletonKey_key" ON "SystemConfig"("singletonKey");

-- CreateIndex
CREATE INDEX "SystemConfig_updatedById_idx" ON "SystemConfig"("updatedById");

-- AddForeignKey
ALTER TABLE "SystemConfig" ADD CONSTRAINT "SystemConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
