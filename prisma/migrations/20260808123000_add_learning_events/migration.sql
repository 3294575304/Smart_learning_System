-- Additive only: existing concept evidence is deliberately not backfilled.
CREATE TYPE "LearningEventType" AS ENUM ('ASSESSMENT_GRADED', 'ASSESSMENT_REVOKED');
CREATE TYPE "LearningEventSourceType" AS ENUM ('STUDENT_ANSWER');

ALTER TABLE "StudentAnswerConceptEvidence" ADD COLUMN "learningEventId" TEXT;

CREATE TABLE "LearningEvent" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "eventType" "LearningEventType" NOT NULL,
  "schemaVersion" VARCHAR(50) NOT NULL,
  "sourceType" "LearningEventSourceType" NOT NULL,
  "sourceId" VARCHAR(191) NOT NULL,
  "sourceRevision" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "inputFingerprint" CHAR(64) NOT NULL,
  "ruleVersion" VARCHAR(50) NOT NULL,
  "supersedesEventId" TEXT,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningEvent_sourceRevision_check" CHECK ("sourceRevision" > 0)
);

CREATE TABLE "LearningEventConcept" (
  "id" TEXT NOT NULL,
  "learningEventId" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "bindingType" "QuestionGraphBindingType" NOT NULL,
  "assignmentQuestionConceptSnapshotId" TEXT NOT NULL,
  "score" DECIMAL(12,4),
  "maxScore" DECIMAL(12,4),
  "weight" DECIMAL(7,4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningEventConcept_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningEventConcept_score_check" CHECK (
    ("score" IS NULL AND "maxScore" IS NULL) OR
    ("score" >= 0 AND "maxScore" > 0 AND "score" <= "maxScore")
  ),
  CONSTRAINT "LearningEventConcept_weight_check" CHECK ("weight" IS NULL OR ("weight" >= 0 AND "weight" <= 100))
);

CREATE UNIQUE INDEX "LearningEvent_supersedesEventId_key" ON "LearningEvent"("supersedesEventId");
CREATE UNIQUE INDEX "LearningEvent_eventType_idempotencyKey_key" ON "LearningEvent"("eventType", "idempotencyKey");
CREATE UNIQUE INDEX "LearningEvent_sourceType_sourceId_sourceRevision_key" ON "LearningEvent"("sourceType", "sourceId", "sourceRevision");
CREATE INDEX "LearningEvent_studentId_courseId_occurredAt_idx" ON "LearningEvent"("studentId", "courseId", "occurredAt");
CREATE INDEX "LearningEvent_courseId_eventType_occurredAt_idx" ON "LearningEvent"("courseId", "eventType", "occurredAt");
CREATE INDEX "LearningEvent_sourceType_sourceId_createdAt_idx" ON "LearningEvent"("sourceType", "sourceId", "createdAt");
CREATE UNIQUE INDEX "LearningEventConcept_learningEventId_conceptId_key" ON "LearningEventConcept"("learningEventId", "conceptId");
CREATE INDEX "LearningEventConcept_conceptId_learningEventId_idx" ON "LearningEventConcept"("conceptId", "learningEventId");
CREATE INDEX "LearningEventConcept_assignmentQuestionConceptSnapshotId_idx" ON "LearningEventConcept"("assignmentQuestionConceptSnapshotId");
CREATE INDEX "StudentAnswerConceptEvidence_learningEventId_idx" ON "StudentAnswerConceptEvidence"("learningEventId");

ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_learningEventId_fkey" FOREIGN KEY ("learningEventId") REFERENCES "LearningEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_supersedesEventId_fkey" FOREIGN KEY ("supersedesEventId") REFERENCES "LearningEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningEventConcept" ADD CONSTRAINT "LearningEventConcept_learningEventId_fkey" FOREIGN KEY ("learningEventId") REFERENCES "LearningEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningEventConcept" ADD CONSTRAINT "LearningEventConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningEventConcept" ADD CONSTRAINT "LearningEventConcept_assignmentQuestionConceptSnapshotId_fkey" FOREIGN KEY ("assignmentQuestionConceptSnapshotId") REFERENCES "AssignmentQuestionConceptSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
