-- Iteration five C adds immutable, deterministic learner profile snapshots.
CREATE TYPE "LearnerProfileEvidenceState" AS ENUM ('NO_EVIDENCE', 'INSUFFICIENT_EVIDENCE', 'CONCLUSIVE');

CREATE TABLE "LearnerProfileSnapshot" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "inputFingerprint" CHAR(64) NOT NULL,
    "calculationRuleVersion" VARCHAR(50) NOT NULL,
    "eventWatermarkId" VARCHAR(191),
    "eventWatermarkOccurredAt" TIMESTAMP(3),
    "graphVersionId" TEXT,
    "masteryRevisionId" TEXT,
    "attendanceDimension" JSONB NOT NULL,
    "activityDimension" JSONB NOT NULL,
    "reflectionDimension" JSONB NOT NULL,
    "objectiveMasteryDimension" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearnerProfileSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearnerProfileConceptEntry" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "evidenceState" "LearnerProfileEvidenceState" NOT NULL,
    "evidenceCount" INTEGER NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "masteryScore" DECIMAL(5,2),
    "evidenceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LearnerProfileConceptEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnerProfileSnapshot_studentId_courseId_revisionNumber_key" ON "LearnerProfileSnapshot"("studentId", "courseId", "revisionNumber");
CREATE UNIQUE INDEX "LearnerProfileSnapshot_studentId_courseId_inputFingerprint_key" ON "LearnerProfileSnapshot"("studentId", "courseId", "inputFingerprint");
CREATE INDEX "LearnerProfileSnapshot_courseId_createdAt_idx" ON "LearnerProfileSnapshot"("courseId", "createdAt");
CREATE INDEX "LearnerProfileSnapshot_masteryRevisionId_idx" ON "LearnerProfileSnapshot"("masteryRevisionId");
CREATE INDEX "LearnerProfileSnapshot_graphVersionId_idx" ON "LearnerProfileSnapshot"("graphVersionId");
CREATE UNIQUE INDEX "LearnerProfileConceptEntry_snapshotId_conceptId_key" ON "LearnerProfileConceptEntry"("snapshotId", "conceptId");
CREATE INDEX "LearnerProfileConceptEntry_conceptId_evidenceState_idx" ON "LearnerProfileConceptEntry"("conceptId", "evidenceState");
CREATE INDEX "LearnerProfileConceptEntry_snapshotId_masteryScore_idx" ON "LearnerProfileConceptEntry"("snapshotId", "masteryScore");

ALTER TABLE "LearnerProfileSnapshot" ADD CONSTRAINT "LearnerProfileSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearnerProfileSnapshot" ADD CONSTRAINT "LearnerProfileSnapshot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearnerProfileSnapshot" ADD CONSTRAINT "LearnerProfileSnapshot_graphVersionId_fkey" FOREIGN KEY ("graphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearnerProfileSnapshot" ADD CONSTRAINT "LearnerProfileSnapshot_masteryRevisionId_fkey" FOREIGN KEY ("masteryRevisionId") REFERENCES "StudentCourseConceptMasteryRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearnerProfileConceptEntry" ADD CONSTRAINT "LearnerProfileConceptEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "LearnerProfileSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearnerProfileConceptEntry" ADD CONSTRAINT "LearnerProfileConceptEntry_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
