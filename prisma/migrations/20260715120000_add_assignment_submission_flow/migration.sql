-- Add assignment policy and autosave concurrency fields.
ALTER TABLE "Assignment"
ADD COLUMN "allowResubmission" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Submission"
ADD COLUMN "saveVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastSavedAt" TIMESTAMP(3);

-- Historical submitted attempts must coexist when repeated submissions are
-- enabled. Only the editable attempt is unique per assignment and student.
DROP INDEX IF EXISTS "Submission_one_current_per_assignment_student_key";

CREATE UNIQUE INDEX "Submission_one_in_progress_per_assignment_student_key"
ON "Submission"("assignmentId", "studentId")
WHERE "status" = 'IN_PROGRESS';

ALTER TABLE "Submission"
ADD CONSTRAINT "Submission_saveVersion_check" CHECK ("saveVersion" >= 0);
