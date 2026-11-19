-- Existing single-target rows already satisfy the new uniqueness constraint.
BEGIN;
CREATE UNIQUE INDEX "QuestionCourseObjective_scope_code_key"
  ON "QuestionCourseObjective" ("questionId", "courseId", "syllabusStructureId", "objectiveCode");
DROP INDEX "QuestionCourseObjective_questionId_courseId_syllabusStructureId_key";
COMMIT;
