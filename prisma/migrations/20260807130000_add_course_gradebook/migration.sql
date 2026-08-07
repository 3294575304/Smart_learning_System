-- CreateEnum
CREATE TYPE "GradeValueStatus" AS ENUM ('NOT_ENTERED', 'SCORED', 'ABSENT', 'DEFERRED', 'LEAVE', 'EXEMPT', 'CHEATING', 'OTHER');

-- CreateEnum
CREATE TYPE "CourseGradeCalculationStatus" AS ENUM ('COMPLETE', 'INCOMPLETE', 'EXEMPT');

-- CreateEnum
CREATE TYPE "GradeImportBatchStatus" AS ENUM ('PREVIEW_READY', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradeImportPreviewStatus" AS ENUM ('VALID', 'UNKNOWN_STUDENT', 'DUPLICATE_STUDENT', 'COURSE_MISMATCH', 'INVALID');

-- CreateEnum
CREATE TYPE "GradeImportExecutionStatus" AS ENUM ('PENDING', 'APPLIED', 'SKIPPED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'GRADEBOOK_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADE_ENTRY_CORRECTED';
ALTER TYPE "AuditAction" ADD VALUE 'PLATFORM_GRADES_SYNCED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADE_IMPORT_PREVIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADE_IMPORT_EXECUTED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADEBOOK_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADE_EXPORT_DOWNLOADED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditTargetType" ADD VALUE 'GRADEBOOK';
ALTER TYPE "AuditTargetType" ADD VALUE 'GRADE_ENTRY';
ALTER TYPE "AuditTargetType" ADD VALUE 'GRADE_IMPORT_BATCH';
ALTER TYPE "AuditTargetType" ADD VALUE 'GRADEBOOK_PUBLICATION';

-- CreateTable
CREATE TABLE "CourseGradebook" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "currentPublicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseGradebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeItem" (
    "id" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "sourceKey" VARCHAR(191) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "maxScore" DECIMAL(10,4) NOT NULL,
    "itemWeight" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "sourceType" "GradeSourceType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGradeEntry" (
    "id" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "gradeItemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentGradeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGradeEntryRevision" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "gradeItemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "GradeValueStatus" NOT NULL,
    "score" DECIMAL(10,4),
    "sourceType" "GradeSourceType" NOT NULL,
    "sourceAssignmentId" TEXT,
    "sourceSubmissionId" TEXT,
    "sourceFingerprint" CHAR(64) NOT NULL,
    "changedById" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentGradeEntryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFinalGradeOverride" (
    "id" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFinalGradeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFinalGradeOverrideRevision" (
    "id" TEXT NOT NULL,
    "overrideId" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "GradeValueStatus" NOT NULL,
    "score" DECIMAL(10,4),
    "sourceType" "GradeSourceType" NOT NULL,
    "sourceFingerprint" CHAR(64) NOT NULL,
    "sourceImportRowId" TEXT,
    "changedById" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFinalGradeOverrideRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCourseGradeState" (
    "id" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCourseGradeState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCourseGradeRevision" (
    "id" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "inputFingerprint" CHAR(64) NOT NULL,
    "calculationRuleVersion" VARCHAR(50) NOT NULL,
    "status" "CourseGradeCalculationStatus" NOT NULL,
    "calculatedScore" DECIMAL(10,4),
    "effectiveStatus" "GradeValueStatus" NOT NULL,
    "effectiveScore" DECIMAL(10,4),
    "componentResultsJson" JSONB NOT NULL,
    "inputSnapshotJson" JSONB NOT NULL,
    "calculatedById" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCourseGradeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradebookPublication" (
    "id" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "inputFingerprint" CHAR(64) NOT NULL,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradebookPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradebookPublicationStudent" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "gradeRevisionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradebookPublicationStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeImportBatch" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "sourceFileVersionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "GradeImportBatchStatus" NOT NULL DEFAULT 'PREVIEW_READY',
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "sourceFileName" VARCHAR(255) NOT NULL,
    "sourceFileChecksum" CHAR(64) NOT NULL,
    "sourceSheetName" VARCHAR(100) NOT NULL,
    "templateVersion" VARCHAR(50) NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "appliedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "previewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawRow" JSONB NOT NULL,
    "studentNo" VARCHAR(50) NOT NULL,
    "studentName" VARCHAR(100) NOT NULL,
    "finalScore" DECIMAL(10,4),
    "specialStatus" "GradeValueStatus" NOT NULL,
    "specialReason" VARCHAR(500),
    "matchedStudentId" TEXT,
    "previewStatus" "GradeImportPreviewStatus" NOT NULL,
    "executionStatus" "GradeImportExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" VARCHAR(100),
    "errorDetail" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeImportRow_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GradeItem" ADD CONSTRAINT "GradeItem_values_check"
  CHECK ("maxScore" > 0 AND "itemWeight" > 0 AND "sortOrder" > 0);
ALTER TABLE "StudentGradeEntry" ADD CONSTRAINT "StudentGradeEntry_revision_check"
  CHECK ("currentRevisionNumber" >= 0);
ALTER TABLE "StudentGradeEntryRevision" ADD CONSTRAINT "StudentGradeEntryRevision_value_check"
  CHECK (
    "revisionNumber" > 0 AND (
      ("status" = 'SCORED' AND "score" IS NOT NULL AND "score" >= 0) OR
      ("status" IN ('ABSENT', 'CHEATING') AND "score" = 0) OR
      ("status" IN ('NOT_ENTERED', 'DEFERRED', 'LEAVE', 'EXEMPT', 'OTHER') AND "score" IS NULL)
    )
  );
ALTER TABLE "StudentFinalGradeOverride" ADD CONSTRAINT "StudentFinalGradeOverride_revision_check"
  CHECK ("currentRevisionNumber" >= 0);
ALTER TABLE "StudentFinalGradeOverrideRevision" ADD CONSTRAINT "StudentFinalGradeOverrideRevision_value_check"
  CHECK (
    "revisionNumber" > 0 AND (
      ("status" = 'SCORED' AND "score" IS NOT NULL AND "score" >= 0 AND "score" <= 100) OR
      ("status" IN ('ABSENT', 'CHEATING') AND "score" = 0) OR
      ("status" IN ('NOT_ENTERED', 'DEFERRED', 'LEAVE', 'EXEMPT', 'OTHER') AND "score" IS NULL)
    )
  );
ALTER TABLE "StudentCourseGradeRevision" ADD CONSTRAINT "StudentCourseGradeRevision_values_check"
  CHECK (
    "revisionNumber" > 0 AND
    ("calculatedScore" IS NULL OR ("calculatedScore" >= 0 AND "calculatedScore" <= 100)) AND
    ("effectiveScore" IS NULL OR ("effectiveScore" >= 0 AND "effectiveScore" <= 100))
  );
ALTER TABLE "GradebookPublication" ADD CONSTRAINT "GradebookPublication_version_check"
  CHECK ("versionNumber" > 0);
ALTER TABLE "GradeImportBatch" ADD CONSTRAINT "GradeImportBatch_counts_check"
  CHECK (
    "totalRows" >= 0 AND "validRows" >= 0 AND "invalidRows" >= 0 AND
    "appliedRows" >= 0 AND "failedRows" >= 0
  );
ALTER TABLE "GradeImportRow" ADD CONSTRAINT "GradeImportRow_value_check"
  CHECK (
    "rowNumber" > 1 AND
    ("finalScore" IS NULL OR ("finalScore" >= 0 AND "finalScore" <= 100))
  );

-- CreateIndex
CREATE UNIQUE INDEX "CourseGradebook_currentPublicationId_key" ON "CourseGradebook"("currentPublicationId");

-- CreateIndex
CREATE INDEX "CourseGradebook_courseId_classroomId_createdAt_idx" ON "CourseGradebook"("courseId", "classroomId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseGradebook_schemeId_createdAt_idx" ON "CourseGradebook"("schemeId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseGradebook_createdById_createdAt_idx" ON "CourseGradebook"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseGradebook_courseId_classroomId_schemeId_key" ON "CourseGradebook"("courseId", "classroomId", "schemeId");

-- CreateIndex
CREATE INDEX "GradeItem_gradebookId_componentId_enabled_sortOrder_idx" ON "GradeItem"("gradebookId", "componentId", "enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "GradeItem_assignmentId_idx" ON "GradeItem"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeItem_gradebookId_sourceKey_key" ON "GradeItem"("gradebookId", "sourceKey");

-- CreateIndex
CREATE INDEX "StudentGradeEntry_gradebookId_studentId_idx" ON "StudentGradeEntry"("gradebookId", "studentId");

-- CreateIndex
CREATE INDEX "StudentGradeEntry_studentId_updatedAt_idx" ON "StudentGradeEntry"("studentId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGradeEntry_gradeItemId_studentId_key" ON "StudentGradeEntry"("gradeItemId", "studentId");

-- CreateIndex
CREATE INDEX "StudentGradeEntryRevision_gradebookId_studentId_createdAt_idx" ON "StudentGradeEntryRevision"("gradebookId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentGradeEntryRevision_gradeItemId_status_createdAt_idx" ON "StudentGradeEntryRevision"("gradeItemId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StudentGradeEntryRevision_sourceAssignmentId_idx" ON "StudentGradeEntryRevision"("sourceAssignmentId");

-- CreateIndex
CREATE INDEX "StudentGradeEntryRevision_sourceSubmissionId_idx" ON "StudentGradeEntryRevision"("sourceSubmissionId");

-- CreateIndex
CREATE INDEX "StudentGradeEntryRevision_changedById_createdAt_idx" ON "StudentGradeEntryRevision"("changedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGradeEntryRevision_entryId_revisionNumber_key" ON "StudentGradeEntryRevision"("entryId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGradeEntryRevision_entryId_sourceFingerprint_key" ON "StudentGradeEntryRevision"("entryId", "sourceFingerprint");

-- CreateIndex
CREATE INDEX "StudentFinalGradeOverride_studentId_updatedAt_idx" ON "StudentFinalGradeOverride"("studentId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFinalGradeOverride_gradebookId_studentId_key" ON "StudentFinalGradeOverride"("gradebookId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFinalGradeOverrideRevision_sourceImportRowId_key" ON "StudentFinalGradeOverrideRevision"("sourceImportRowId");

-- CreateIndex
CREATE INDEX "StudentFinalGradeOverrideRevision_gradebookId_studentId_cre_idx" ON "StudentFinalGradeOverrideRevision"("gradebookId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentFinalGradeOverrideRevision_changedById_createdAt_idx" ON "StudentFinalGradeOverrideRevision"("changedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFinalGradeOverrideRevision_overrideId_revisionNumber_key" ON "StudentFinalGradeOverrideRevision"("overrideId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFinalGradeOverrideRevision_overrideId_sourceFingerpr_key" ON "StudentFinalGradeOverrideRevision"("overrideId", "sourceFingerprint");

-- CreateIndex
CREATE INDEX "StudentCourseGradeState_studentId_updatedAt_idx" ON "StudentCourseGradeState"("studentId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCourseGradeState_gradebookId_studentId_key" ON "StudentCourseGradeState"("gradebookId", "studentId");

-- CreateIndex
CREATE INDEX "StudentCourseGradeRevision_gradebookId_studentId_calculated_idx" ON "StudentCourseGradeRevision"("gradebookId", "studentId", "calculatedAt");

-- CreateIndex
CREATE INDEX "StudentCourseGradeRevision_schemeId_calculatedAt_idx" ON "StudentCourseGradeRevision"("schemeId", "calculatedAt");

-- CreateIndex
CREATE INDEX "StudentCourseGradeRevision_calculatedById_calculatedAt_idx" ON "StudentCourseGradeRevision"("calculatedById", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCourseGradeRevision_stateId_revisionNumber_key" ON "StudentCourseGradeRevision"("stateId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCourseGradeRevision_stateId_inputFingerprint_key" ON "StudentCourseGradeRevision"("stateId", "inputFingerprint");

-- CreateIndex
CREATE INDEX "GradebookPublication_publishedById_publishedAt_idx" ON "GradebookPublication"("publishedById", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GradebookPublication_gradebookId_versionNumber_key" ON "GradebookPublication"("gradebookId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GradebookPublication_gradebookId_inputFingerprint_key" ON "GradebookPublication"("gradebookId", "inputFingerprint");

-- CreateIndex
CREATE INDEX "GradebookPublicationStudent_studentId_publicationId_idx" ON "GradebookPublicationStudent"("studentId", "publicationId");

-- CreateIndex
CREATE INDEX "GradebookPublicationStudent_gradeRevisionId_idx" ON "GradebookPublicationStudent"("gradeRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "GradebookPublicationStudent_publicationId_studentId_key" ON "GradebookPublicationStudent"("publicationId", "studentId");

-- CreateIndex
CREATE INDEX "GradeImportBatch_courseId_classroomId_status_createdAt_idx" ON "GradeImportBatch"("courseId", "classroomId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GradeImportBatch_sourceFileVersionId_idx" ON "GradeImportBatch"("sourceFileVersionId");

-- CreateIndex
CREATE INDEX "GradeImportBatch_createdById_createdAt_idx" ON "GradeImportBatch"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GradeImportBatch_gradebookId_idempotencyKey_key" ON "GradeImportBatch"("gradebookId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GradeImportRow_batchId_previewStatus_idx" ON "GradeImportRow"("batchId", "previewStatus");

-- CreateIndex
CREATE INDEX "GradeImportRow_batchId_executionStatus_idx" ON "GradeImportRow"("batchId", "executionStatus");

-- CreateIndex
CREATE INDEX "GradeImportRow_batchId_studentNo_idx" ON "GradeImportRow"("batchId", "studentNo");

-- CreateIndex
CREATE INDEX "GradeImportRow_matchedStudentId_idx" ON "GradeImportRow"("matchedStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeImportRow_batchId_rowNumber_key" ON "GradeImportRow"("batchId", "rowNumber");

-- AddForeignKey
ALTER TABLE "CourseGradebook" ADD CONSTRAINT "CourseGradebook_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseGradebook" ADD CONSTRAINT "CourseGradebook_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseGradebook" ADD CONSTRAINT "CourseGradebook_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "PublishedAssessmentScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseGradebook" ADD CONSTRAINT "CourseGradebook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseGradebook" ADD CONSTRAINT "CourseGradebook_currentPublicationId_fkey" FOREIGN KEY ("currentPublicationId") REFERENCES "GradebookPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeItem" ADD CONSTRAINT "GradeItem_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeItem" ADD CONSTRAINT "GradeItem_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PublishedAssessmentComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeItem" ADD CONSTRAINT "GradeItem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntry" ADD CONSTRAINT "StudentGradeEntry_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntry" ADD CONSTRAINT "StudentGradeEntry_gradeItemId_fkey" FOREIGN KEY ("gradeItemId") REFERENCES "GradeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntry" ADD CONSTRAINT "StudentGradeEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntryRevision" ADD CONSTRAINT "StudentGradeEntryRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "StudentGradeEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntryRevision" ADD CONSTRAINT "StudentGradeEntryRevision_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntryRevision" ADD CONSTRAINT "StudentGradeEntryRevision_gradeItemId_fkey" FOREIGN KEY ("gradeItemId") REFERENCES "GradeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntryRevision" ADD CONSTRAINT "StudentGradeEntryRevision_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntryRevision" ADD CONSTRAINT "StudentGradeEntryRevision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntryRevision" ADD CONSTRAINT "StudentGradeEntryRevision_sourceAssignmentId_fkey" FOREIGN KEY ("sourceAssignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGradeEntryRevision" ADD CONSTRAINT "StudentGradeEntryRevision_sourceSubmissionId_fkey" FOREIGN KEY ("sourceSubmissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFinalGradeOverride" ADD CONSTRAINT "StudentFinalGradeOverride_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFinalGradeOverride" ADD CONSTRAINT "StudentFinalGradeOverride_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFinalGradeOverrideRevision" ADD CONSTRAINT "StudentFinalGradeOverrideRevision_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "StudentFinalGradeOverride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFinalGradeOverrideRevision" ADD CONSTRAINT "StudentFinalGradeOverrideRevision_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFinalGradeOverrideRevision" ADD CONSTRAINT "StudentFinalGradeOverrideRevision_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFinalGradeOverrideRevision" ADD CONSTRAINT "StudentFinalGradeOverrideRevision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFinalGradeOverrideRevision" ADD CONSTRAINT "StudentFinalGradeOverrideRevision_sourceImportRowId_fkey" FOREIGN KEY ("sourceImportRowId") REFERENCES "GradeImportRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourseGradeState" ADD CONSTRAINT "StudentCourseGradeState_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourseGradeState" ADD CONSTRAINT "StudentCourseGradeState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourseGradeRevision" ADD CONSTRAINT "StudentCourseGradeRevision_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "StudentCourseGradeState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourseGradeRevision" ADD CONSTRAINT "StudentCourseGradeRevision_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourseGradeRevision" ADD CONSTRAINT "StudentCourseGradeRevision_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "PublishedAssessmentScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourseGradeRevision" ADD CONSTRAINT "StudentCourseGradeRevision_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourseGradeRevision" ADD CONSTRAINT "StudentCourseGradeRevision_calculatedById_fkey" FOREIGN KEY ("calculatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradebookPublication" ADD CONSTRAINT "GradebookPublication_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradebookPublication" ADD CONSTRAINT "GradebookPublication_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradebookPublicationStudent" ADD CONSTRAINT "GradebookPublicationStudent_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "GradebookPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradebookPublicationStudent" ADD CONSTRAINT "GradebookPublicationStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradebookPublicationStudent" ADD CONSTRAINT "GradebookPublicationStudent_gradeRevisionId_fkey" FOREIGN KEY ("gradeRevisionId") REFERENCES "StudentCourseGradeRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeImportBatch" ADD CONSTRAINT "GradeImportBatch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeImportBatch" ADD CONSTRAINT "GradeImportBatch_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeImportBatch" ADD CONSTRAINT "GradeImportBatch_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeImportBatch" ADD CONSTRAINT "GradeImportBatch_sourceFileVersionId_fkey" FOREIGN KEY ("sourceFileVersionId") REFERENCES "CourseFileVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeImportBatch" ADD CONSTRAINT "GradeImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeImportRow" ADD CONSTRAINT "GradeImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GradeImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeImportRow" ADD CONSTRAINT "GradeImportRow_matchedStudentId_fkey" FOREIGN KEY ("matchedStudentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
