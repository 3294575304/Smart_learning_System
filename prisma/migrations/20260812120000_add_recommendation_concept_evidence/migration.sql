-- Iteration six batch two: freeze course Concept bindings and project recommendation practice evidence.
ALTER TYPE "LearningEventType" ADD VALUE IF NOT EXISTS 'RECOMMENDATION_PRACTICE_GRADED';
ALTER TYPE "LearningEventType" ADD VALUE IF NOT EXISTS 'RECOMMENDATION_PRACTICE_REVOKED';
ALTER TYPE "LearningEventSourceType" ADD VALUE IF NOT EXISTS 'RECOMMENDATION_PRACTICE_ANSWER';

ALTER TABLE "LearningEventConcept"
  ALTER COLUMN "assignmentQuestionConceptSnapshotId" DROP NOT NULL,
  ADD COLUMN "recommendationConceptSnapshotId" TEXT;

CREATE TABLE "CourseRecommendationConceptSnapshot" (
  "id" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "bindingType" "QuestionGraphBindingType" NOT NULL,
  "bindingSetRevision" INTEGER NOT NULL,
  "sourceGraphVersionId" TEXT NOT NULL,
  "sourceNodeId" TEXT NOT NULL,
  "publishedGraphVersionId" TEXT NOT NULL,
  "resolvedNodeId" TEXT NOT NULL,
  "resolutionStatus" "AssignmentConceptResolutionStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseRecommendationConceptSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecommendationConceptEvidence" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "recommendationPracticeAnswerId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "recommendationConceptSnapshotId" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "bindingType" "QuestionGraphBindingType" NOT NULL,
  "revision" INTEGER NOT NULL,
  "inputFingerprint" CHAR(64) NOT NULL,
  "status" "ConceptEvidenceStatus" NOT NULL,
  "score" DECIMAL(12,4),
  "maxScore" DECIMAL(12,4),
  "normalizedScore" DECIMAL(7,4),
  "gradedAt" TIMESTAMP(3),
  "supersedesEvidenceId" TEXT,
  "learningEventId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecommendationConceptEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseRecommendationConceptSnapshot_recommendationId_conceptId_key" ON "CourseRecommendationConceptSnapshot"("recommendationId", "conceptId");
CREATE INDEX "CourseRecommendationConceptSnapshot_courseId_conceptId_idx" ON "CourseRecommendationConceptSnapshot"("courseId", "conceptId");
CREATE INDEX "CourseRecommendationConceptSnapshot_questionId_idx" ON "CourseRecommendationConceptSnapshot"("questionId");
CREATE INDEX "CourseRecommendationConceptSnapshot_sourceGraphVersionId_idx" ON "CourseRecommendationConceptSnapshot"("sourceGraphVersionId");
CREATE INDEX "CourseRecommendationConceptSnapshot_publishedGraphVersionId_idx" ON "CourseRecommendationConceptSnapshot"("publishedGraphVersionId");
CREATE UNIQUE INDEX "RecommendationConceptEvidence_supersedesEvidenceId_key" ON "RecommendationConceptEvidence"("supersedesEvidenceId");
CREATE UNIQUE INDEX "RecommendationConceptEvidence_recommendationPracticeAnswerId_conceptId_revision_key" ON "RecommendationConceptEvidence"("recommendationPracticeAnswerId", "conceptId", "revision");
CREATE INDEX "RecommendationConceptEvidence_studentId_courseId_conceptId_revision_idx" ON "RecommendationConceptEvidence"("studentId", "courseId", "conceptId", "revision");
CREATE INDEX "RecommendationConceptEvidence_recommendationId_revision_idx" ON "RecommendationConceptEvidence"("recommendationId", "revision");
CREATE INDEX "RecommendationConceptEvidence_recommendationConceptSnapshotId_idx" ON "RecommendationConceptEvidence"("recommendationConceptSnapshotId");
CREATE INDEX "RecommendationConceptEvidence_learningEventId_idx" ON "RecommendationConceptEvidence"("learningEventId");
CREATE INDEX "LearningEventConcept_recommendationConceptSnapshotId_idx" ON "LearningEventConcept"("recommendationConceptSnapshotId");

ALTER TABLE "CourseRecommendationConceptSnapshot" ADD CONSTRAINT "CourseRecommendationConceptSnapshot_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "PersonalizedRecommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationConceptSnapshot" ADD CONSTRAINT "CourseRecommendationConceptSnapshot_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationConceptSnapshot" ADD CONSTRAINT "CourseRecommendationConceptSnapshot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationConceptSnapshot" ADD CONSTRAINT "CourseRecommendationConceptSnapshot_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationConceptSnapshot" ADD CONSTRAINT "CourseRecommendationConceptSnapshot_sourceGraphVersionId_fkey" FOREIGN KEY ("sourceGraphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationConceptSnapshot" ADD CONSTRAINT "CourseRecommendationConceptSnapshot_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "PublishedKnowledgeGraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationConceptSnapshot" ADD CONSTRAINT "CourseRecommendationConceptSnapshot_publishedGraphVersionId_fkey" FOREIGN KEY ("publishedGraphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationConceptSnapshot" ADD CONSTRAINT "CourseRecommendationConceptSnapshot_resolvedNodeId_fkey" FOREIGN KEY ("resolvedNodeId") REFERENCES "PublishedKnowledgeGraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningEventConcept" ADD CONSTRAINT "LearningEventConcept_recommendationConceptSnapshotId_fkey" FOREIGN KEY ("recommendationConceptSnapshotId") REFERENCES "CourseRecommendationConceptSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LearningEventConcept" ADD CONSTRAINT "LearningEventConcept_exactly_one_snapshot_check" CHECK (num_nonnulls("assignmentQuestionConceptSnapshotId", "recommendationConceptSnapshotId") = 1);
ALTER TABLE "RecommendationConceptEvidence" ADD CONSTRAINT "RecommendationConceptEvidence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationConceptEvidence" ADD CONSTRAINT "RecommendationConceptEvidence_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationConceptEvidence" ADD CONSTRAINT "RecommendationConceptEvidence_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "PersonalizedRecommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationConceptEvidence" ADD CONSTRAINT "RecommendationConceptEvidence_recommendationPracticeAnswerId_fkey" FOREIGN KEY ("recommendationPracticeAnswerId") REFERENCES "RecommendationPracticeAnswer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationConceptEvidence" ADD CONSTRAINT "RecommendationConceptEvidence_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationConceptEvidence" ADD CONSTRAINT "RecommendationConceptEvidence_recommendationConceptSnapshotId_fkey" FOREIGN KEY ("recommendationConceptSnapshotId") REFERENCES "CourseRecommendationConceptSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationConceptEvidence" ADD CONSTRAINT "RecommendationConceptEvidence_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationConceptEvidence" ADD CONSTRAINT "RecommendationConceptEvidence_supersedesEvidenceId_fkey" FOREIGN KEY ("supersedesEvidenceId") REFERENCES "RecommendationConceptEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationConceptEvidence" ADD CONSTRAINT "RecommendationConceptEvidence_learningEventId_fkey" FOREIGN KEY ("learningEventId") REFERENCES "LearningEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
