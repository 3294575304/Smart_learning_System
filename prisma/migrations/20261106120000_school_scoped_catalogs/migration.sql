-- Give each school private course templates and question-bank categories.
ALTER TABLE "CourseTemplate" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "QuestionCourseCategory" ADD COLUMN "schoolId" TEXT;

-- Remove the old global uniqueness before duplicating each catalog per school.
DROP INDEX "CourseTemplate_code_key";
DROP INDEX "QuestionCourseCategory_normalizedName_key";

ALTER TABLE "CourseTemplate"
  ADD CONSTRAINT "CourseTemplate_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionCourseCategory"
  ADD CONSTRAINT "QuestionCourseCategory_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Clone every existing catalog row for every school. Original unscoped rows
-- remain only as legacy sources for references that cannot be assigned a school.
INSERT INTO "CourseTemplate" (
  "id", "schoolId", "code", "name", "description", "version",
  "isBuiltin", "isActive", "createdAt", "updatedAt"
)
SELECT
  'ct_' || substr(md5(school."id" || ':' || source."id"), 1, 24),
  school."id", source."code", source."name", source."description",
  source."version", source."isBuiltin", source."isActive",
  source."createdAt", source."updatedAt"
FROM "CourseTemplate" AS source
CROSS JOIN "School" AS school
WHERE source."schoolId" IS NULL;

INSERT INTO "QuestionCourseCategory" (
  "id", "schoolId", "name", "normalizedName", "isActive", "createdAt", "updatedAt"
)
SELECT
  'qc_' || substr(md5(school."id" || ':' || source."id"), 1, 24),
  school."id", source."name", source."normalizedName", source."isActive",
  source."createdAt", source."updatedAt"
FROM "QuestionCourseCategory" AS source
CROSS JOIN "School" AS school
WHERE source."schoolId" IS NULL;

-- Keep every existing course attached to the catalog belonging to its teacher.
UPDATE "Course" AS course
SET "templateId" = 'ct_' || substr(md5(teacher."schoolId" || ':' || source."id"), 1, 24)
FROM "CourseTemplate" AS source, "User" AS teacher
WHERE course."templateId" = source."id"
  AND course."teacherId" = teacher."id"
  AND teacher."schoolId" IS NOT NULL
  AND source."schoolId" IS NULL;

UPDATE "Course" AS course
SET "questionCategoryId" = 'qc_' || substr(md5(teacher."schoolId" || ':' || source."id"), 1, 24)
FROM "QuestionCourseCategory" AS source, "User" AS teacher
WHERE course."questionCategoryId" = source."id"
  AND course."teacherId" = teacher."id"
  AND teacher."schoolId" IS NOT NULL
  AND source."schoolId" IS NULL;

-- Questions belong to their creator's school; their category copy is moved
-- accordingly without changing question content, visibility, or revisions.
UPDATE "Question" AS question
SET "questionCategoryId" = 'qc_' || substr(md5(creator."schoolId" || ':' || source."id"), 1, 24)
FROM "QuestionCourseCategory" AS source, "User" AS creator
WHERE question."questionCategoryId" = source."id"
  AND question."creatorId" = creator."id"
  AND creator."schoolId" IS NOT NULL
  AND source."schoolId" IS NULL;

CREATE UNIQUE INDEX "CourseTemplate_schoolId_code_key"
  ON "CourseTemplate"("schoolId", "code");
CREATE INDEX "CourseTemplate_schoolId_name_isActive_idx"
  ON "CourseTemplate"("schoolId", "name", "isActive");

CREATE UNIQUE INDEX "QuestionCourseCategory_schoolId_normalizedName_key"
  ON "QuestionCourseCategory"("schoolId", "normalizedName");
CREATE INDEX "QuestionCourseCategory_schoolId_isActive_name_idx"
  ON "QuestionCourseCategory"("schoolId", "isActive", "name");
