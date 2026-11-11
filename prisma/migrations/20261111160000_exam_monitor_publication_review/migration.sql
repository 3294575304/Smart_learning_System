ALTER TYPE "AuditAction" ADD VALUE 'EXAM_PUBLICATION_POLICY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXAM_SCORE_REVIEW_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'EXAM_SCORE_REVIEW_RESOLVED';

CREATE TYPE "ExamPublicationMode" AS ENUM ('SCHEDULED', 'WHEN_READY');

CREATE TABLE "ExamResultPublication" (
  "assignmentId" TEXT NOT NULL PRIMARY KEY REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "mode" "ExamPublicationMode" NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "checkedAt" TIMESTAMP(3),
  "revision" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExamResultPublication_mode_check" CHECK (("mode" = 'SCHEDULED') = ("scheduledAt" IS NOT NULL))
);

CREATE INDEX "ExamResultPublication_completedAt_checkedAt_idx" ON "ExamResultPublication"("completedAt", "checkedAt");

CREATE TABLE "ExamScoreReview" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "submissionId" TEXT NOT NULL REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "reason" VARCHAR(1000) NOT NULL,
  "response" VARCHAR(1000),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "ExamScoreReview_submissionId_key" ON "ExamScoreReview"("submissionId");
