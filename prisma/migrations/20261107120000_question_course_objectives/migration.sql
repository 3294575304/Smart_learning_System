ALTER TABLE "Question" ADD COLUMN "defaultObjectiveKind" VARCHAR(20);
ALTER TABLE "Question" ADD CONSTRAINT "Question_defaultObjectiveKind_check" CHECK ("defaultObjectiveKind" IS NULL OR "defaultObjectiveKind" IN ('KNOWLEDGE', 'ABILITY', 'LITERACY'));
ALTER TABLE "ExamQuestionUse" ADD COLUMN "objectiveCode" VARCHAR(50), ADD COLUMN "syllabusStructureId" TEXT;
ALTER TABLE "PersonalizedRecommendation" ALTER COLUMN "targetDifficulty" DROP NOT NULL;

CREATE TABLE "QuestionCourseObjective" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "syllabusStructureId" TEXT NOT NULL,
  "objectiveCode" VARCHAR(50) NOT NULL,
  "source" VARCHAR(20) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionCourseObjective_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionCourseObjective_questionId_courseId_syllabusStructureId_key" ON "QuestionCourseObjective"("questionId", "courseId", "syllabusStructureId");
CREATE INDEX "QuestionCourseObjective_courseId_syllabusStructureId_objectiveCode_idx" ON "QuestionCourseObjective"("courseId", "syllabusStructureId", "objectiveCode");
ALTER TABLE "QuestionCourseObjective" ADD CONSTRAINT "QuestionCourseObjective_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionCourseObjective" ADD CONSTRAINT "QuestionCourseObjective_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionCourseObjective" ADD CONSTRAINT "QuestionCourseObjective_syllabusStructureId_fkey" FOREIGN KEY ("syllabusStructureId") REFERENCES "PublishedSyllabusStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
