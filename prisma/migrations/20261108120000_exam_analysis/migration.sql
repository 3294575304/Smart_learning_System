ALTER TYPE "AuditAction" ADD VALUE 'EXAM_ANALYSIS_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXAM_ANALYSIS_DOWNLOADED';

CREATE TABLE "ExamAnalysis" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "inputFingerprint" CHAR(64) NOT NULL,
    "thresholds" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExamAnalysis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExamAnalysis_examSessionId_revision_key" ON "ExamAnalysis"("examSessionId", "revision");
CREATE INDEX "ExamAnalysis_examSessionId_createdAt_idx" ON "ExamAnalysis"("examSessionId", "createdAt");
ALTER TABLE "ExamAnalysis" ADD CONSTRAINT "ExamAnalysis_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExamAnalysis" ADD CONSTRAINT "ExamAnalysis_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
