CREATE TYPE "AIEnhancementStatus" AS ENUM ('NOT_ATTEMPTED', 'SUCCEEDED', 'FAILED');

ALTER TABLE "KnowledgeGraphDraft"
  ADD COLUMN "aiEnhancementStatus" "AIEnhancementStatus" NOT NULL DEFAULT 'NOT_ATTEMPTED',
  ADD COLUMN "aiWarningCode" VARCHAR(100),
  ADD COLUMN "aiWarningMessage" TEXT,
  ADD COLUMN "aiAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiFinishedAt" TIMESTAMP(3);

-- Existing rows predate explicit AI enhancement tracking. The default deliberately
-- leaves their historical AI state unknown instead of inferring or fabricating it.
