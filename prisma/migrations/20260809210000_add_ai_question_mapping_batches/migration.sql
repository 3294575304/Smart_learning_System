-- Iteration five D persists AI candidates separately from confirmed bindings.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'AI_QUESTION_MAPPING_BATCH_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'AI_QUESTION_MAPPING_BATCH_CONFIRMED';
CREATE TYPE "AIQuestionMappingBatchStatus" AS ENUM ('READY', 'FAILED', 'CONFIRMED');

CREATE TABLE "AIQuestionMappingBatch" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "graphVersionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "AIQuestionMappingBatchStatus" NOT NULL DEFAULT 'READY',
    "inputFingerprint" CHAR(64) NOT NULL,
    "provider" VARCHAR(100),
    "model" VARCHAR(191),
    "promptVersion" VARCHAR(50) NOT NULL,
    "ruleVersion" VARCHAR(50) NOT NULL,
    "failureCode" VARCHAR(100),
    "failureSummary" VARCHAR(500),
    "confirmedSelections" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIQuestionMappingBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AIQuestionMappingCandidate" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "publishedNodeId" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIQuestionMappingCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AIQuestionMappingBatch_createdById_courseId_inputFingerprint_key" ON "AIQuestionMappingBatch"("createdById", "courseId", "inputFingerprint");
CREATE INDEX "AIQuestionMappingBatch_courseId_status_createdAt_idx" ON "AIQuestionMappingBatch"("courseId", "status", "createdAt");
CREATE INDEX "AIQuestionMappingBatch_graphVersionId_idx" ON "AIQuestionMappingBatch"("graphVersionId");
CREATE UNIQUE INDEX "AIQuestionMappingCandidate_batchId_questionId_conceptId_key" ON "AIQuestionMappingCandidate"("batchId", "questionId", "conceptId");
CREATE INDEX "AIQuestionMappingCandidate_batchId_questionId_rank_idx" ON "AIQuestionMappingCandidate"("batchId", "questionId", "rank");
CREATE INDEX "AIQuestionMappingCandidate_publishedNodeId_idx" ON "AIQuestionMappingCandidate"("publishedNodeId");

ALTER TABLE "AIQuestionMappingBatch" ADD CONSTRAINT "AIQuestionMappingBatch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionMappingBatch" ADD CONSTRAINT "AIQuestionMappingBatch_graphVersionId_fkey" FOREIGN KEY ("graphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionMappingBatch" ADD CONSTRAINT "AIQuestionMappingBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionMappingCandidate" ADD CONSTRAINT "AIQuestionMappingCandidate_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AIQuestionMappingBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionMappingCandidate" ADD CONSTRAINT "AIQuestionMappingCandidate_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionMappingCandidate" ADD CONSTRAINT "AIQuestionMappingCandidate_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionMappingCandidate" ADD CONSTRAINT "AIQuestionMappingCandidate_publishedNodeId_fkey" FOREIGN KEY ("publishedNodeId") REFERENCES "PublishedKnowledgeGraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
