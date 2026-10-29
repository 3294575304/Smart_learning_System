ALTER TYPE "AuditAction" ADD VALUE 'AI_QUESTION_BATCH_DELETED';

ALTER TABLE "AIQuestionGenerationBatch"
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "AIQuestionGenerationBatch_teacherId_deletedAt_createdAt_idx"
ON "AIQuestionGenerationBatch"("teacherId", "deletedAt", "createdAt");
