CREATE TYPE "AssignmentCategory" AS ENUM ('PRACTICE', 'COURSE_ASSIGNMENT', 'COURSE_EXPERIMENT');
ALTER TYPE "AuditAction" ADD VALUE 'ASSIGNMENT_CATEGORY_CORRECTED';
ALTER TABLE "Assignment" ADD COLUMN "category" "AssignmentCategory" NOT NULL DEFAULT 'PRACTICE', ADD COLUMN "categoryNeedsReview" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Assignment" SET "categoryNeedsReview" = true;
ALTER TABLE "PublishedAssessmentComponent" ADD COLUMN "assignmentAggregationConfirmed" BOOLEAN NOT NULL DEFAULT false;
