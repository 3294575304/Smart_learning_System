DROP INDEX IF EXISTS "Question_visibility_status_deletedAt_type_difficulty_idx";
DROP INDEX IF EXISTS "Question_type_difficulty_idx";
CREATE INDEX "Question_visibility_status_deletedAt_type_idx" ON "Question"("visibility", "status", "deletedAt", "type");
CREATE INDEX "Question_type_idx" ON "Question"("type");
ALTER TABLE "AssignmentQuestion" ALTER COLUMN "difficultySnapshot" DROP NOT NULL;
ALTER TABLE "Question" DROP COLUMN "difficulty";
