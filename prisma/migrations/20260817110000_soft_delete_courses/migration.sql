DROP INDEX "Course_teacherId_courseNo_term_key";

CREATE INDEX "Course_teacherId_courseNo_term_idx"
ON "Course"("teacherId", "courseNo", "term");

CREATE UNIQUE INDEX "Course_active_teacherId_courseNo_term_key"
ON "Course"("teacherId", "courseNo", "term")
WHERE "status" <> 'ARCHIVED';
