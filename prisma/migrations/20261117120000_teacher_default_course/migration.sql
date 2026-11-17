ALTER TABLE "User" ADD COLUMN "teacherDefaultCourseId" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_teacherDefaultCourseId_fkey"
FOREIGN KEY ("teacherDefaultCourseId") REFERENCES "Course"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
