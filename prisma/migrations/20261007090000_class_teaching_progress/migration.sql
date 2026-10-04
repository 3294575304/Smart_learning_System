ALTER TABLE "CourseTeachingProgressRevision" ADD COLUMN "classroomId" TEXT;
ALTER TABLE "CourseTeachingProgressRevision" ADD CONSTRAINT "CourseTeachingProgressRevision_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CourseTeachingProgressRevision_classroomId_revisionNumber_idx" ON "CourseTeachingProgressRevision"("classroomId", "revisionNumber");
