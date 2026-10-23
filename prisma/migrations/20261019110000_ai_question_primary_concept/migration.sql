ALTER TABLE "AIQuestionGenerationCandidate" ADD COLUMN "primaryConceptId" TEXT;
ALTER TABLE "AIQuestionGenerationBatch" ADD COLUMN "failureDetails" JSONB NOT NULL DEFAULT '[]';
