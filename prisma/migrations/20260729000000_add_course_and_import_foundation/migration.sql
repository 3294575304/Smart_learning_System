-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseFileKind" AS ENUM (
    'SYLLABUS',
    'MATERIAL',
    'PRACTICE_GUIDE',
    'REPORT_TEMPLATE',
    'IMPORT_SOURCE',
    'ACCOUNT_SHEET',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "StudentImportBatchStatus" AS ENUM (
    'UPLOADED',
    'PREVIEW_READY',
    'CONFIRMED',
    'PROCESSING',
    'SUCCEEDED',
    'PARTIAL_FAILED',
    'FAILED',
    'CANCELLED'
);

-- CreateEnum
CREATE TYPE "StudentImportPreviewStatus" AS ENUM (
    'PENDING',
    'NEW_USER',
    'EXISTING_USER',
    'ALREADY_ENROLLED',
    'COURSE_MISMATCH',
    'INVALID',
    'DUPLICATE'
);

-- CreateEnum
CREATE TYPE "StudentImportExecutionStatus" AS ENUM ('PENDING', 'APPLIED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "CourseTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseNo" VARCHAR(50) NOT NULL,
    "term" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseFileVersion" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileKind" "CourseFileKind" NOT NULL,
    "fileKey" VARCHAR(100) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "originalFileName" VARCHAR(255) NOT NULL,
    "storageKey" VARCHAR(191) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentImportBatch" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "classroomId" TEXT,
    "createdById" TEXT NOT NULL,
    "sourceFileVersionId" TEXT NOT NULL,
    "accountSheetVersionId" TEXT,
    "status" "StudentImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "idempotencyKey" VARCHAR(191) NOT NULL,
    "sourceFileName" VARCHAR(255) NOT NULL,
    "sourceFileChecksum" CHAR(64) NOT NULL,
    "sourceFileMimeType" VARCHAR(100) NOT NULL,
    "sourceFileSizeBytes" INTEGER NOT NULL,
    "sourceSheetName" VARCHAR(100),
    "mappingConfig" JSONB NOT NULL,
    "previewSummary" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "previewRows" INTEGER NOT NULL DEFAULT 0,
    "newUserRows" INTEGER NOT NULL DEFAULT 0,
    "existingUserRows" INTEGER NOT NULL DEFAULT 0,
    "alreadyEnrolledRows" INTEGER NOT NULL DEFAULT 0,
    "courseMismatchRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "previewedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "accountSheetDownloadedAt" TIMESTAMP(3),
    "accountSheetDownloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "previewStatus" "StudentImportPreviewStatus" NOT NULL DEFAULT 'PENDING',
    "executionStatus" "StudentImportExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "rowKey" VARCHAR(191) NOT NULL,
    "sourceRow" JSONB NOT NULL,
    "academicTerm" VARCHAR(50) NOT NULL,
    "courseNo" VARCHAR(50) NOT NULL,
    "studentNo" VARCHAR(50) NOT NULL,
    "studentName" VARCHAR(100) NOT NULL,
    "className" VARCHAR(100) NOT NULL,
    "errorCode" VARCHAR(100),
    "errorDetail" JSONB,
    "matchedUserId" TEXT,
    "matchedMembershipId" TEXT,
    "createdUserId" TEXT,
    "createdMembershipId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentImportRow_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User"
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Classroom" ADD COLUMN     "courseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CourseTemplate_code_key" ON "CourseTemplate"("code");

-- CreateIndex
CREATE INDEX "CourseTemplate_name_isActive_idx" ON "CourseTemplate"("name", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Course_teacherId_courseNo_term_key" ON "Course"("teacherId", "courseNo", "term");

-- CreateIndex
CREATE INDEX "Course_templateId_status_createdAt_idx" ON "Course"("templateId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Course_teacherId_status_createdAt_idx" ON "Course"("teacherId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Course_term_courseNo_idx" ON "Course"("term", "courseNo");

-- CreateIndex
CREATE UNIQUE INDEX "CourseFileVersion_storageKey_key" ON "CourseFileVersion"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "CourseFileVersion_courseId_fileKind_fileKey_versionNumber_key" ON "CourseFileVersion"("courseId", "fileKind", "fileKey", "versionNumber");

-- CreateIndex
CREATE INDEX "CourseFileVersion_courseId_fileKind_createdAt_idx" ON "CourseFileVersion"("courseId", "fileKind", "createdAt");

-- CreateIndex
CREATE INDEX "CourseFileVersion_courseId_uploadedById_createdAt_idx" ON "CourseFileVersion"("courseId", "uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "StudentImportBatch_courseId_status_createdAt_idx" ON "StudentImportBatch"("courseId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StudentImportBatch_classroomId_status_createdAt_idx" ON "StudentImportBatch"("classroomId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StudentImportBatch_createdById_createdAt_idx" ON "StudentImportBatch"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "StudentImportBatch_sourceFileVersionId_idx" ON "StudentImportBatch"("sourceFileVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentImportBatch_courseId_idempotencyKey_key" ON "StudentImportBatch"("courseId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StudentImportBatch_accountSheetVersionId_key" ON "StudentImportBatch"("accountSheetVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentImportRow_batchId_rowNumber_key" ON "StudentImportRow"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "StudentImportRow_batchId_previewStatus_idx" ON "StudentImportRow"("batchId", "previewStatus");

-- CreateIndex
CREATE INDEX "StudentImportRow_batchId_executionStatus_idx" ON "StudentImportRow"("batchId", "executionStatus");

-- CreateIndex
CREATE INDEX "StudentImportRow_batchId_studentNo_idx" ON "StudentImportRow"("batchId", "studentNo");

-- CreateIndex
CREATE INDEX "StudentImportRow_batchId_rowKey_idx" ON "StudentImportRow"("batchId", "rowKey");

-- CreateIndex
CREATE INDEX "StudentImportRow_matchedUserId_idx" ON "StudentImportRow"("matchedUserId");

-- CreateIndex
CREATE INDEX "StudentImportRow_matchedMembershipId_idx" ON "StudentImportRow"("matchedMembershipId");

-- CreateIndex
CREATE INDEX "StudentImportRow_createdUserId_idx" ON "StudentImportRow"("createdUserId");

-- CreateIndex
CREATE INDEX "StudentImportRow_createdMembershipId_idx" ON "StudentImportRow"("createdMembershipId");

-- CreateIndex
CREATE INDEX "User_mustChangePassword_idx" ON "User"("mustChangePassword");

-- CreateIndex
CREATE INDEX "Classroom_courseId_status_idx" ON "Classroom"("courseId", "status");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CourseTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseFileVersion" ADD CONSTRAINT "CourseFileVersion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseFileVersion" ADD CONSTRAINT "CourseFileVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportBatch" ADD CONSTRAINT "StudentImportBatch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportBatch" ADD CONSTRAINT "StudentImportBatch_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportBatch" ADD CONSTRAINT "StudentImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportBatch" ADD CONSTRAINT "StudentImportBatch_sourceFileVersionId_fkey" FOREIGN KEY ("sourceFileVersionId") REFERENCES "CourseFileVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportBatch" ADD CONSTRAINT "StudentImportBatch_accountSheetVersionId_fkey" FOREIGN KEY ("accountSheetVersionId") REFERENCES "CourseFileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportRow" ADD CONSTRAINT "StudentImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StudentImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportRow" ADD CONSTRAINT "StudentImportRow_matchedUserId_fkey" FOREIGN KEY ("matchedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportRow" ADD CONSTRAINT "StudentImportRow_matchedMembershipId_fkey" FOREIGN KEY ("matchedMembershipId") REFERENCES "ClassMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportRow" ADD CONSTRAINT "StudentImportRow_createdUserId_fkey" FOREIGN KEY ("createdUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentImportRow" ADD CONSTRAINT "StudentImportRow_createdMembershipId_fkey" FOREIGN KEY ("createdMembershipId") REFERENCES "ClassMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TYPE "AuditTargetType" ADD VALUE 'COURSE';
ALTER TYPE "AuditTargetType" ADD VALUE 'COURSE_TEMPLATE';
ALTER TYPE "AuditTargetType" ADD VALUE 'COURSE_FILE';
ALTER TYPE "AuditTargetType" ADD VALUE 'STUDENT_IMPORT_BATCH';
