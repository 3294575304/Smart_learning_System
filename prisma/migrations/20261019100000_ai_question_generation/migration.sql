ALTER TYPE "AuditAction" ADD VALUE 'AI_QUESTION_BATCH_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'AI_QUESTION_CANDIDATE_EDITED';
ALTER TYPE "AuditAction" ADD VALUE 'AI_QUESTION_CANDIDATE_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'AI_QUESTION_CANDIDATE_DISCARDED';
ALTER TYPE "AuditTargetType" ADD VALUE 'AI_QUESTION_BATCH';

CREATE TABLE "AIQuestionGenerationBatch" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "jobId" TEXT,
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "questionCategoryId" TEXT NOT NULL,
  "graphVersionId" TEXT,
  "syllabusStructureId" TEXT,
  "mode" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "request" JSONB NOT NULL,
  "generationRevision" INTEGER NOT NULL DEFAULT 1,
  "requestedCount" INTEGER NOT NULL,
  "generatedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCode" VARCHAR(100),
  "provider" VARCHAR(100),
  "model" VARCHAR(191),
  "promptVersion" VARCHAR(50) NOT NULL,
  "ruleVersion" VARCHAR(50) NOT NULL,
  "sourceFileName" VARCHAR(255),
  "sourceFileFormat" VARCHAR(20),
  "sourceFileStorageKey" VARCHAR(191),
  "sourceFileChecksum" CHAR(64),
  "sourceFileSizeBytes" INTEGER,
  "sourceFileExpiresAt" TIMESTAMP(3),
  "sourceFileDeletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIQuestionGenerationBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AIQuestionGenerationCandidate" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'REVIEW',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "questionJson" JSONB NOT NULL,
  "programmingConfig" JSONB,
  "sourceRefs" JSONB NOT NULL,
  "qualityFlags" JSONB NOT NULL,
  "reviewHistory" JSONB NOT NULL DEFAULT '[]',
  "confirmedQuestionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIQuestionGenerationCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AIQuestionGenerationBatch_jobId_key" ON "AIQuestionGenerationBatch"("jobId");
CREATE UNIQUE INDEX "AIQuestionGenerationBatch_idempotencyKey_key" ON "AIQuestionGenerationBatch"("idempotencyKey");
CREATE UNIQUE INDEX "AIQuestionGenerationBatch_sourceFileStorageKey_key" ON "AIQuestionGenerationBatch"("sourceFileStorageKey");
CREATE INDEX "AIQuestionGenerationBatch_teacherId_createdAt_idx" ON "AIQuestionGenerationBatch"("teacherId", "createdAt");
CREATE INDEX "AIQuestionGenerationBatch_courseId_status_createdAt_idx" ON "AIQuestionGenerationBatch"("courseId", "status", "createdAt");
CREATE INDEX "AIQuestionGenerationBatch_sourceFileExpiresAt_sourceFileDeletedAt_idx" ON "AIQuestionGenerationBatch"("sourceFileExpiresAt", "sourceFileDeletedAt");
CREATE UNIQUE INDEX "AIQuestionGenerationCandidate_confirmedQuestionId_key" ON "AIQuestionGenerationCandidate"("confirmedQuestionId");
CREATE UNIQUE INDEX "AIQuestionGenerationCandidate_batchId_ordinal_key" ON "AIQuestionGenerationCandidate"("batchId", "ordinal");
CREATE INDEX "AIQuestionGenerationCandidate_batchId_status_ordinal_idx" ON "AIQuestionGenerationCandidate"("batchId", "status", "ordinal");

ALTER TABLE "AIQuestionGenerationBatch" ADD CONSTRAINT "AIQuestionGenerationBatch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionGenerationBatch" ADD CONSTRAINT "AIQuestionGenerationBatch_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionGenerationBatch" ADD CONSTRAINT "AIQuestionGenerationBatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionGenerationCandidate" ADD CONSTRAINT "AIQuestionGenerationCandidate_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AIQuestionGenerationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionGenerationCandidate" ADD CONSTRAINT "AIQuestionGenerationCandidate_confirmedQuestionId_fkey" FOREIGN KEY ("confirmedQuestionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
