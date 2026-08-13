-- Iteration six closeout: allow the existing isolated Python judge to serve
-- either assignment answers or course recommendation practice, and persist
-- student-controlled self-reflection independently from objective profiles.
CREATE TYPE "StudentSelfReflectionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'DELETED');
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECOMMENDATION_PROGRAMMING_ATTEMPT_REJUDGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECOMMENDATION_PROGRAMMING_ATTEMPT_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COURSE_RECOMMENDATION_POLICY_UPDATED';

ALTER TABLE "ProgrammingAttempt"
  ALTER COLUMN "studentAnswerId" DROP NOT NULL,
  ALTER COLUMN "assignmentQuestionId" DROP NOT NULL,
  ALTER COLUMN "configSnapshotId" DROP NOT NULL,
  ADD COLUMN "recommendationId" TEXT,
  ADD COLUMN "questionId" TEXT,
  ADD COLUMN "configRevisionId" TEXT;

CREATE UNIQUE INDEX "ProgrammingAttempt_recommendationId_kind_revisionNumber_key"
  ON "ProgrammingAttempt"("recommendationId", "kind", "revisionNumber");
CREATE INDEX "ProgrammingAttempt_recommendationId_createdAt_idx"
  ON "ProgrammingAttempt"("recommendationId", "createdAt");
CREATE INDEX "ProgrammingAttempt_questionId_createdAt_idx"
  ON "ProgrammingAttempt"("questionId", "createdAt");

ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "PersonalizedRecommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_configRevisionId_fkey"
  FOREIGN KEY ("configRevisionId") REFERENCES "ProgrammingQuestionConfigRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_exactly_one_source_check"
  CHECK (
    (num_nonnulls("studentAnswerId", "assignmentQuestionId", "configSnapshotId") = 3
      AND num_nonnulls("recommendationId", "questionId", "configRevisionId") = 0)
    OR
    (num_nonnulls("studentAnswerId", "assignmentQuestionId", "configSnapshotId") = 0
      AND num_nonnulls("recommendationId", "questionId", "configRevisionId") = 3)
  );

-- A programming rejudge is a new assessment even when its deterministic score
-- happens to equal the previous result. Keeping the attempt key on the projected
-- answer lets the append-only event/evidence pipeline distinguish that revision.
ALTER TABLE "RecommendationPracticeAnswer"
  ADD COLUMN "assessmentRevisionKey" VARCHAR(191);

CREATE TABLE "StudentSelfReflection" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "inputText" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "difficulties" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "learningHabits" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "practiceRequest" JSONB,
  "status" "StudentSelfReflectionStatus" NOT NULL DEFAULT 'DRAFT',
  "provider" TEXT,
  "model" TEXT,
  "promptVersion" VARCHAR(100) NOT NULL,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "confirmedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentSelfReflection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StudentSelfReflection_studentId_courseId_status_createdAt_idx"
  ON "StudentSelfReflection"("studentId", "courseId", "status", "createdAt");
CREATE INDEX "StudentSelfReflection_courseId_status_createdAt_idx"
  ON "StudentSelfReflection"("courseId", "status", "createdAt");
ALTER TABLE "StudentSelfReflection" ADD CONSTRAINT "StudentSelfReflection_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentSelfReflection" ADD CONSTRAINT "StudentSelfReflection_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
