-- Standalone reports have a teacher owner but no course or classroom.
-- Preserve the existing single-resource rule for every other file.
ALTER TABLE "CourseFileVersion"
  DROP CONSTRAINT "CourseFileVersion_single_resource_check";

ALTER TABLE "CourseFileVersion"
  ADD CONSTRAINT "CourseFileVersion_single_resource_check"
  CHECK (
    ("courseId" IS NOT NULL AND "classroomId" IS NULL)
    OR ("courseId" IS NULL AND "classroomId" IS NOT NULL)
    OR (
      "courseId" IS NULL AND "classroomId" IS NULL
      AND (
        "fileKind" IN ('REPORT_TEMPLATE', 'REPORT_GRADE_SOURCE')
        OR (
          "fileKind" = 'OTHER'
          AND COALESCE("metadata"->>'purpose', '') = 'STANDALONE_REPORT_SYLLABUS'
        )
      )
    )
  );
