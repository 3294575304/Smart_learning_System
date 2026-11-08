CREATE TYPE "AssignmentGradeCategory" AS ENUM ('PRACTICE', 'COURSE_ASSIGNMENT', 'COURSE_EXPERIMENT', 'MIDTERM_EXAM', 'FINAL_EXAM');
ALTER TABLE "Assignment" ADD COLUMN "gradeCategory" "AssignmentGradeCategory";
ALTER TABLE "GradeItem" ADD COLUMN "included" BOOLEAN NOT NULL DEFAULT true;
UPDATE "GradeItem" SET "included" = "enabled" WHERE "enabled" = false;
CREATE TABLE "GradebookComponentSource" (
  "id" TEXT NOT NULL,
  "gradebookId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "sourceType" "GradeSourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradebookComponentSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GradebookComponentSource_gradebookId_componentId_key" ON "GradebookComponentSource"("gradebookId", "componentId");
ALTER TABLE "GradebookComponentSource" ADD CONSTRAINT "GradebookComponentSource_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradebookComponentSource" ADD CONSTRAINT "GradebookComponentSource_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PublishedAssessmentComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TYPE "AuditAction" ADD VALUE 'ASSIGNMENT_CATEGORY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADEBOOK_SOURCE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'GRADEBOOK_ASSIGNMENT_REMOVED';
