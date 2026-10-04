-- Existing questions keep NULL; legacy knowledge and published snapshots are unchanged.
ALTER TABLE "Question" ADD COLUMN "categoryCourseId" TEXT;
CREATE INDEX "Question_categoryCourseId_status_deletedAt_idx" ON "Question"("categoryCourseId", "status", "deletedAt");
ALTER TABLE "Question" ADD CONSTRAINT "Question_categoryCourseId_fkey" FOREIGN KEY ("categoryCourseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
