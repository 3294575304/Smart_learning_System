-- Teaching quality report generations are immutable snapshots. Uploaded source
-- files remain isolated from the formal gradebook and generated artifacts are
-- downloaded only through ownership-checked application routes.
CREATE TYPE "QualityReportSourceType" AS ENUM ('PLATFORM', 'UPLOAD');
CREATE TYPE "QualityReportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

ALTER TYPE "AuditAction" ADD VALUE 'QUALITY_REPORT_GENERATION_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'QUALITY_REPORT_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'QUALITY_REPORT_DOWNLOADED';
ALTER TYPE "AuditTargetType" ADD VALUE 'QUALITY_REPORT';
ALTER TYPE "CourseFileKind" ADD VALUE 'REPORT_GRADE_SOURCE';

CREATE TABLE "CourseQualityReport" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "classroomId" TEXT,
  "gradebookId" TEXT,
  "outcomeAttainmentRunId" TEXT,
  "requestedById" TEXT NOT NULL,
  "backgroundJobId" TEXT,
  "sourceFileVersionId" TEXT,
  "sourceType" "QualityReportSourceType" NOT NULL,
  "status" "QualityReportStatus" NOT NULL DEFAULT 'QUEUED',
  "versionNumber" INTEGER NOT NULL,
  "inputFingerprint" CHAR(64) NOT NULL,
  "templateVersion" VARCHAR(50) NOT NULL,
  "templateChecksumSha256" CHAR(64) NOT NULL,
  "calculationRuleVersion" VARCHAR(50) NOT NULL,
  "promptVersion" VARCHAR(50) NOT NULL,
  "aiProvider" VARCHAR(100),
  "aiModel" VARCHAR(120),
  "aiStatus" VARCHAR(30) NOT NULL DEFAULT 'NOT_ATTEMPTED',
  "sourceSnapshotJson" JSONB NOT NULL,
  "statisticsSnapshotJson" JSONB,
  "narrativeSnapshotJson" JSONB,
  "docxStorageKey" VARCHAR(191),
  "docxFileName" VARCHAR(255),
  "docxSizeBytes" INTEGER,
  "docxChecksumSha256" CHAR(64),
  "workbookStorageKey" VARCHAR(191),
  "workbookFileName" VARCHAR(255),
  "workbookSizeBytes" INTEGER,
  "workbookChecksumSha256" CHAR(64),
  "errorCode" VARCHAR(100),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseQualityReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseQualityReport_backgroundJobId_key" ON "CourseQualityReport"("backgroundJobId");
CREATE UNIQUE INDEX "CourseQualityReport_docxStorageKey_key" ON "CourseQualityReport"("docxStorageKey");
CREATE UNIQUE INDEX "CourseQualityReport_workbookStorageKey_key" ON "CourseQualityReport"("workbookStorageKey");
CREATE UNIQUE INDEX "CourseQualityReport_courseId_versionNumber_key" ON "CourseQualityReport"("courseId", "versionNumber");
CREATE UNIQUE INDEX "CourseQualityReport_courseId_inputFingerprint_key" ON "CourseQualityReport"("courseId", "inputFingerprint");
CREATE INDEX "CourseQualityReport_courseId_status_createdAt_idx" ON "CourseQualityReport"("courseId", "status", "createdAt");
CREATE INDEX "CourseQualityReport_classroomId_createdAt_idx" ON "CourseQualityReport"("classroomId", "createdAt");
CREATE INDEX "CourseQualityReport_gradebookId_createdAt_idx" ON "CourseQualityReport"("gradebookId", "createdAt");
CREATE INDEX "CourseQualityReport_requestedById_createdAt_idx" ON "CourseQualityReport"("requestedById", "createdAt");
CREATE INDEX "CourseQualityReport_sourceFileVersionId_idx" ON "CourseQualityReport"("sourceFileVersionId");
CREATE INDEX "CourseQualityReport_outcomeAttainmentRunId_idx" ON "CourseQualityReport"("outcomeAttainmentRunId");

ALTER TABLE "CourseQualityReport" ADD CONSTRAINT "CourseQualityReport_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseQualityReport" ADD CONSTRAINT "CourseQualityReport_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseQualityReport" ADD CONSTRAINT "CourseQualityReport_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseQualityReport" ADD CONSTRAINT "CourseQualityReport_outcomeAttainmentRunId_fkey" FOREIGN KEY ("outcomeAttainmentRunId") REFERENCES "CourseOutcomeAttainmentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseQualityReport" ADD CONSTRAINT "CourseQualityReport_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseQualityReport" ADD CONSTRAINT "CourseQualityReport_backgroundJobId_fkey" FOREIGN KEY ("backgroundJobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseQualityReport" ADD CONSTRAINT "CourseQualityReport_sourceFileVersionId_fkey" FOREIGN KEY ("sourceFileVersionId") REFERENCES "CourseFileVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

