-- Add course file audit actions.
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_FILE_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_FILE_DOWNLOADED';

-- Allow course files to belong to either a course or a classroom.
ALTER TABLE "CourseFileVersion" DROP CONSTRAINT "CourseFileVersion_courseId_fkey";

ALTER TABLE "CourseFileVersion"
  ADD COLUMN "classroomId" TEXT,
  ALTER COLUMN "courseId" DROP NOT NULL;

ALTER TABLE "CourseFileVersion"
  ADD CONSTRAINT "CourseFileVersion_single_resource_check"
  CHECK (
    ("courseId" IS NOT NULL AND "classroomId" IS NULL)
    OR ("courseId" IS NULL AND "classroomId" IS NOT NULL)
  );

ALTER TABLE "CourseFileVersion"
  ADD CONSTRAINT "CourseFileVersion_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CourseFileVersion"
  ADD CONSTRAINT "CourseFileVersion_classroomId_fkey"
  FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CourseFileVersion_classroomId_fileKind_fileKey_versionNumber_key"
  ON "CourseFileVersion"("classroomId", "fileKind", "fileKey", "versionNumber");

CREATE INDEX "CourseFileVersion_classroomId_fileKind_createdAt_idx"
  ON "CourseFileVersion"("classroomId", "fileKind", "createdAt");

CREATE INDEX "CourseFileVersion_classroomId_uploadedById_createdAt_idx"
  ON "CourseFileVersion"("classroomId", "uploadedById", "createdAt");

CREATE INDEX "CourseFileVersion_checksumSha256_idx"
  ON "CourseFileVersion"("checksumSha256");
