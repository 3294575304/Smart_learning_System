CREATE TABLE "StudentQuestionFavorite" (
 "id" TEXT NOT NULL,
 "studentId" TEXT NOT NULL,
 "questionId" TEXT NOT NULL,
 "courseId" TEXT,
 "sourceKind" VARCHAR(30) NOT NULL,
 "sourceId" TEXT NOT NULL,
 "titleSnapshot" TEXT NOT NULL,
 "typeSnapshot" "QuestionType" NOT NULL,
 "courseNameSnapshot" TEXT,
 "knowledgePoints" JSONB NOT NULL,
 "note" TEXT NOT NULL DEFAULT '',
 "revision" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "StudentQuestionFavorite_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "StudentQuestionFavorite_sourceKind_check" CHECK ("sourceKind" IN ('RECOMMENDATION', 'ASSIGNMENT')),
 CONSTRAINT "StudentQuestionFavorite_note_check" CHECK (char_length("note") <= 1000),
 CONSTRAINT "StudentQuestionFavorite_points_check" CHECK (jsonb_typeof("knowledgePoints") = 'array')
);
CREATE UNIQUE INDEX "StudentQuestionFavorite_studentId_questionId_key" ON "StudentQuestionFavorite"("studentId", "questionId");
CREATE INDEX "StudentQuestionFavorite_student_course_created_idx" ON "StudentQuestionFavorite"("studentId", "courseId", "createdAt");
ALTER TABLE "StudentQuestionFavorite" ADD CONSTRAINT "StudentQuestionFavorite_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionFavorite" ADD CONSTRAINT "StudentQuestionFavorite_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionFavorite" ADD CONSTRAINT "StudentQuestionFavorite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
