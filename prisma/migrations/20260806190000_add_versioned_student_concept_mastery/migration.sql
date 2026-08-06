CREATE TYPE "AssignmentConceptResolutionStatus" AS ENUM (
  'RESOLVED',
  'NO_CURRENT_PUBLISHED_GRAPH',
  'MISSING_FROM_PUBLISHED_GRAPH'
);

CREATE TYPE "ConceptEvidenceStatus" AS ENUM ('VALID', 'REVOKED');
CREATE TYPE "ConceptEvidenceGradingSource" AS ENUM ('AUTO_GRADING', 'MANUAL_GRADING');
CREATE TYPE "CourseConceptMasteryLevel" AS ENUM ('NEEDS_SUPPORT', 'DEVELOPING', 'MASTERED');

ALTER TABLE "StudentAnswer"
ADD COLUMN "conceptEvidenceRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StudentAnswer"
ADD CONSTRAINT "StudentAnswer_conceptEvidenceRevision_check"
CHECK ("conceptEvidenceRevision" >= 0);

CREATE TABLE "AssignmentQuestionConceptSnapshot" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "assignmentQuestionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "bindingType" "QuestionGraphBindingType" NOT NULL,
  "bindingSetRevision" INTEGER NOT NULL,
  "sourceGraphVersionId" TEXT NOT NULL,
  "sourceNodeId" TEXT NOT NULL,
  "publishedGraphVersionId" TEXT,
  "resolvedNodeId" TEXT,
  "resolutionStatus" "AssignmentConceptResolutionStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssignmentQuestionConceptSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssignmentQuestionConceptSnapshot_bindingSetRevision_check" CHECK ("bindingSetRevision" >= 1),
  CONSTRAINT "AssignmentQuestionConceptSnapshot_resolution_check" CHECK (
    ("resolutionStatus" = 'RESOLVED' AND "publishedGraphVersionId" IS NOT NULL AND "resolvedNodeId" IS NOT NULL)
    OR ("resolutionStatus" = 'NO_CURRENT_PUBLISHED_GRAPH' AND "publishedGraphVersionId" IS NULL AND "resolvedNodeId" IS NULL)
    OR ("resolutionStatus" = 'MISSING_FROM_PUBLISHED_GRAPH' AND "publishedGraphVersionId" IS NOT NULL AND "resolvedNodeId" IS NULL)
  )
);

CREATE TABLE "StudentAnswerConceptEvidence" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "assignmentQuestionId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "studentAnswerId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "assignmentQuestionConceptSnapshotId" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "bindingType" "QuestionGraphBindingType" NOT NULL,
  "revision" INTEGER NOT NULL,
  "inputFingerprint" CHAR(64) NOT NULL,
  "status" "ConceptEvidenceStatus" NOT NULL,
  "gradingSource" "ConceptEvidenceGradingSource",
  "score" DECIMAL(12,4),
  "maxScore" DECIMAL(12,4),
  "normalizedScore" DECIMAL(7,4),
  "gradedAt" TIMESTAMP(3),
  "supersedesEvidenceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentAnswerConceptEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentAnswerConceptEvidence_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "StudentAnswerConceptEvidence_payload_check" CHECK (
    (
      "status" = 'VALID'
      AND "gradingSource" IS NOT NULL
      AND "score" IS NOT NULL
      AND "maxScore" IS NOT NULL
      AND "maxScore" > 0
      AND "score" >= 0
      AND "score" <= "maxScore"
      AND "normalizedScore" IS NOT NULL
      AND "normalizedScore" >= 0
      AND "normalizedScore" <= 100
      AND "normalizedScore" = ROUND(("score" / "maxScore") * 100, 4)
      AND "gradedAt" IS NOT NULL
    )
    OR (
      "status" = 'REVOKED'
      AND "gradingSource" IS NULL
      AND "score" IS NULL
      AND "maxScore" IS NULL
      AND "normalizedScore" IS NULL
      AND "gradedAt" IS NULL
    )
  )
);

CREATE TABLE "StudentCourseConceptMasteryState" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentCourseConceptMasteryState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentCourseConceptMasteryRevision" (
  "id" TEXT NOT NULL,
  "stateId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "inputFingerprint" CHAR(64) NOT NULL,
  "calculationRuleVersion" VARCHAR(50) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentCourseConceptMasteryRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentCourseConceptMasteryRevision_number_check" CHECK ("revisionNumber" >= 1)
);

CREATE TABLE "StudentCourseConceptMasteryEntry" (
  "id" TEXT NOT NULL,
  "masteryRevisionId" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "evidenceCount" INTEGER NOT NULL,
  "distinctAnswerCount" INTEGER NOT NULL,
  "earnedPoints" DECIMAL(14,4) NOT NULL,
  "availablePoints" DECIMAL(14,4) NOT NULL,
  "masteryScore" DECIMAL(5,2) NOT NULL,
  "level" "CourseConceptMasteryLevel" NOT NULL,
  "firstEvidenceAt" TIMESTAMP(3) NOT NULL,
  "lastEvidenceAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentCourseConceptMasteryEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentCourseConceptMasteryEntry_values_check" CHECK (
    "evidenceCount" > 0
    AND "distinctAnswerCount" > 0
    AND "distinctAnswerCount" <= "evidenceCount"
    AND "earnedPoints" >= 0
    AND "availablePoints" > 0
    AND "earnedPoints" <= "availablePoints"
    AND "masteryScore" >= 0
    AND "masteryScore" <= 100
    AND "masteryScore" = ROUND(("earnedPoints" / "availablePoints") * 100, 2)
    AND "firstEvidenceAt" <= "lastEvidenceAt"
  )
);

CREATE UNIQUE INDEX "AssignmentQuestionConceptSnapshot_assignmentQuestionId_conceptId_key"
ON "AssignmentQuestionConceptSnapshot"("assignmentQuestionId", "conceptId");
CREATE INDEX "AssignmentQuestionConceptSnapshot_assignmentId_resolutionStatus_idx"
ON "AssignmentQuestionConceptSnapshot"("assignmentId", "resolutionStatus");
CREATE INDEX "AssignmentQuestionConceptSnapshot_courseId_conceptId_idx"
ON "AssignmentQuestionConceptSnapshot"("courseId", "conceptId");
CREATE INDEX "AssignmentQuestionConceptSnapshot_sourceGraphVersionId_idx"
ON "AssignmentQuestionConceptSnapshot"("sourceGraphVersionId");
CREATE INDEX "AssignmentQuestionConceptSnapshot_sourceNodeId_idx"
ON "AssignmentQuestionConceptSnapshot"("sourceNodeId");
CREATE INDEX "AssignmentQuestionConceptSnapshot_publishedGraphVersionId_idx"
ON "AssignmentQuestionConceptSnapshot"("publishedGraphVersionId");
CREATE INDEX "AssignmentQuestionConceptSnapshot_resolvedNodeId_idx"
ON "AssignmentQuestionConceptSnapshot"("resolvedNodeId");

CREATE UNIQUE INDEX "StudentAnswerConceptEvidence_supersedesEvidenceId_key"
ON "StudentAnswerConceptEvidence"("supersedesEvidenceId");
CREATE UNIQUE INDEX "StudentAnswerConceptEvidence_studentAnswerId_conceptId_revision_key"
ON "StudentAnswerConceptEvidence"("studentAnswerId", "conceptId", "revision");
CREATE INDEX "StudentAnswerConceptEvidence_studentId_courseId_conceptId_revision_idx"
ON "StudentAnswerConceptEvidence"("studentId", "courseId", "conceptId", "revision");
CREATE INDEX "StudentAnswerConceptEvidence_studentAnswerId_revision_idx"
ON "StudentAnswerConceptEvidence"("studentAnswerId", "revision");
CREATE INDEX "StudentAnswerConceptEvidence_assignmentQuestionConceptSnapshotId_idx"
ON "StudentAnswerConceptEvidence"("assignmentQuestionConceptSnapshotId");
CREATE INDEX "StudentAnswerConceptEvidence_submissionId_idx"
ON "StudentAnswerConceptEvidence"("submissionId");
CREATE INDEX "StudentAnswerConceptEvidence_courseId_createdAt_idx"
ON "StudentAnswerConceptEvidence"("courseId", "createdAt");

CREATE UNIQUE INDEX "StudentCourseConceptMasteryState_studentId_courseId_key"
ON "StudentCourseConceptMasteryState"("studentId", "courseId");
CREATE INDEX "StudentCourseConceptMasteryState_courseId_studentId_idx"
ON "StudentCourseConceptMasteryState"("courseId", "studentId");
CREATE UNIQUE INDEX "StudentCourseConceptMasteryRevision_stateId_revisionNumber_key"
ON "StudentCourseConceptMasteryRevision"("stateId", "revisionNumber");
CREATE UNIQUE INDEX "StudentCourseConceptMasteryRevision_stateId_inputFingerprint_key"
ON "StudentCourseConceptMasteryRevision"("stateId", "inputFingerprint");
CREATE INDEX "StudentCourseConceptMasteryRevision_stateId_createdAt_idx"
ON "StudentCourseConceptMasteryRevision"("stateId", "createdAt");
CREATE UNIQUE INDEX "StudentCourseConceptMasteryEntry_masteryRevisionId_conceptId_key"
ON "StudentCourseConceptMasteryEntry"("masteryRevisionId", "conceptId");
CREATE INDEX "StudentCourseConceptMasteryEntry_conceptId_masteryScore_idx"
ON "StudentCourseConceptMasteryEntry"("conceptId", "masteryScore");
CREATE INDEX "StudentCourseConceptMasteryEntry_masteryRevisionId_level_idx"
ON "StudentCourseConceptMasteryEntry"("masteryRevisionId", "level");

ALTER TABLE "AssignmentQuestionConceptSnapshot" ADD CONSTRAINT "AssignmentQuestionConceptSnapshot_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentQuestionConceptSnapshot" ADD CONSTRAINT "AssignmentQuestionConceptSnapshot_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssignmentQuestionConceptSnapshot" ADD CONSTRAINT "AssignmentQuestionConceptSnapshot_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentQuestionConceptSnapshot" ADD CONSTRAINT "AssignmentQuestionConceptSnapshot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentQuestionConceptSnapshot" ADD CONSTRAINT "AssignmentQuestionConceptSnapshot_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentQuestionConceptSnapshot" ADD CONSTRAINT "AssignmentQuestionConceptSnapshot_sourceGraphVersionId_fkey" FOREIGN KEY ("sourceGraphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentQuestionConceptSnapshot" ADD CONSTRAINT "AssignmentQuestionConceptSnapshot_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "PublishedKnowledgeGraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentQuestionConceptSnapshot" ADD CONSTRAINT "AssignmentQuestionConceptSnapshot_publishedGraphVersionId_fkey" FOREIGN KEY ("publishedGraphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentQuestionConceptSnapshot" ADD CONSTRAINT "AssignmentQuestionConceptSnapshot_resolvedNodeId_fkey" FOREIGN KEY ("resolvedNodeId") REFERENCES "PublishedKnowledgeGraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_studentAnswerId_fkey" FOREIGN KEY ("studentAnswerId") REFERENCES "StudentAnswer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_assignmentQuestionConceptSnapshotId_fkey" FOREIGN KEY ("assignmentQuestionConceptSnapshotId") REFERENCES "AssignmentQuestionConceptSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswerConceptEvidence" ADD CONSTRAINT "StudentAnswerConceptEvidence_supersedesEvidenceId_fkey" FOREIGN KEY ("supersedesEvidenceId") REFERENCES "StudentAnswerConceptEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentCourseConceptMasteryState" ADD CONSTRAINT "StudentCourseConceptMasteryState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentCourseConceptMasteryState" ADD CONSTRAINT "StudentCourseConceptMasteryState_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentCourseConceptMasteryRevision" ADD CONSTRAINT "StudentCourseConceptMasteryRevision_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "StudentCourseConceptMasteryState"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentCourseConceptMasteryEntry" ADD CONSTRAINT "StudentCourseConceptMasteryEntry_masteryRevisionId_fkey" FOREIGN KEY ("masteryRevisionId") REFERENCES "StudentCourseConceptMasteryRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentCourseConceptMasteryEntry" ADD CONSTRAINT "StudentCourseConceptMasteryEntry_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
