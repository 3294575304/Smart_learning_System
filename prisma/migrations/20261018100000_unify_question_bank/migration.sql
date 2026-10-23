-- Create a global course directory for the shared question bank.
CREATE TABLE "QuestionCourseCategory" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalizedName" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionCourseCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionCourseCategory_normalizedName_key"
    ON "QuestionCourseCategory"("normalizedName");
CREATE INDEX "QuestionCourseCategory_isActive_name_idx"
    ON "QuestionCourseCategory"("isActive", "name");

-- Same normalized course name maps to one shared category across teachers and terms.
INSERT INTO "QuestionCourseCategory" (
    "id", "name", "normalizedName", "isActive", "createdAt", "updatedAt"
)
SELECT
    'c' || substr(md5('question-course-category:' || normalized_name), 1, 24),
    min(display_name),
    normalized_name,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT
        lower(btrim(regexp_replace(normalize("name", NFKC), '[[:space:]]+', ' ', 'g'))) AS normalized_name,
        btrim(regexp_replace(normalize("name", NFKC), '[[:space:]]+', ' ', 'g')) AS display_name
    FROM "Course"
    WHERE regexp_replace(normalize("name", NFKC), '[[:space:]]+', '', 'g') <> ''
) AS source_names
GROUP BY normalized_name;

ALTER TABLE "Course" ADD COLUMN "questionCategoryId" TEXT;
UPDATE "Course" AS course
SET "questionCategoryId" = category."id"
FROM "QuestionCourseCategory" AS category
WHERE lower(btrim(regexp_replace(normalize(course."name", NFKC), '[[:space:]]+', ' ', 'g'))) = category."normalizedName";
ALTER TABLE "Course" ALTER COLUMN "questionCategoryId" SET NOT NULL;
CREATE INDEX "Course_questionCategoryId_status_createdAt_idx"
    ON "Course"("questionCategoryId", "status", "createdAt");
ALTER TABLE "Course"
    ADD CONSTRAINT "Course_questionCategoryId_fkey"
    FOREIGN KEY ("questionCategoryId") REFERENCES "QuestionCourseCategory"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Question" ADD COLUMN "questionCategoryId" TEXT;
ALTER TABLE "Question" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Question" ADD COLUMN "archivedFromStatus" "QuestionStatus";

-- Prefer the explicit legacy course category. For uncategorized questions, infer
-- only when all course graph bindings resolve to a single global category.
UPDATE "Question" AS question
SET "questionCategoryId" = course."questionCategoryId"
FROM "Course" AS course
WHERE question."categoryCourseId" = course."id";

WITH binding_categories AS (
    SELECT
        binding."questionId",
        count(DISTINCT course."questionCategoryId") AS category_count,
        min(course."questionCategoryId") AS category_id
    FROM "QuestionKnowledgeGraphBindingSet" AS binding_set
    JOIN "Course" AS course ON course."id" = binding_set."courseId"
    JOIN "QuestionKnowledgeGraphBinding" AS binding
      ON binding."bindingSetId" = binding_set."id"
    GROUP BY binding."questionId"
)
UPDATE "Question" AS question
SET "questionCategoryId" = binding_categories.category_id
FROM binding_categories
WHERE question."questionCategoryId" IS NULL
  AND binding_categories.category_count = 1
  AND question."id" = binding_categories."questionId";

CREATE INDEX "Question_questionCategoryId_status_deletedAt_idx"
    ON "Question"("questionCategoryId", "status", "deletedAt");
ALTER TABLE "Question"
    ADD CONSTRAINT "Question_questionCategoryId_fkey"
    FOREIGN KEY ("questionCategoryId") REFERENCES "QuestionCourseCategory"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'QUESTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'QUESTION_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'QUESTION_RESTORED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'QUESTION_COURSE_CATEGORY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'QUESTION_COURSE_CATEGORY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'QUESTION_COURSE_CATEGORY_DISABLED';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'QUESTION_COURSE_CATEGORY';
