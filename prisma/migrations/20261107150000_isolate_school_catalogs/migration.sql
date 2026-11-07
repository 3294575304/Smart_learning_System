-- Remove unused school catalog copies created by the initial cross-school
-- backfill. Keep the per-school Python defaults and every catalog row already
-- referenced by a course, question, exam session, or paper draft.
DELETE FROM "QuestionCourseCategory" AS category
WHERE category."schoolId" IS NOT NULL
  AND category."id" ~ '^qc_[0-9a-f]{24}$'
  AND category."normalizedName" <> 'python 程序设计'
  AND NOT EXISTS (
    SELECT 1 FROM "Course" AS course
    WHERE course."questionCategoryId" = category."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Question" AS question
    WHERE question."questionCategoryId" = category."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ExamSession" AS exam
    WHERE exam."questionCategoryId" = category."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ExamPaperDraft" AS draft
    WHERE draft."questionCategoryId" = category."id"
  );

-- Keep each school's built-in Python template, but remove unused migration
-- copies of any other global templates.
DELETE FROM "CourseTemplate" AS template
WHERE template."schoolId" IS NOT NULL
  AND template."id" ~ '^ct_[0-9a-f]{24}$'
  AND template."code" <> 'python-programming-v1'
  AND NOT EXISTS (
    SELECT 1 FROM "Course" AS course
    WHERE course."templateId" = template."id"
  );
