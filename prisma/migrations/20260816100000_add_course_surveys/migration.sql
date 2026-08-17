-- Iteration seven: end-of-course teaching quality surveys.
-- Anonymous response rows deliberately omit studentId. Participation is stored
-- separately without a response foreign key so teacher-facing data cannot join
-- an anonymous answer back to a student.

CREATE TYPE "CourseSurveyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');
CREATE TYPE "CourseSurveyMode" AS ENUM ('IDENTIFIED', 'ANONYMOUS');
CREATE TYPE "CourseSurveyQuestionType" AS ENUM ('LIKERT_5', 'OPEN_TEXT');
CREATE TYPE "CourseSurveyDimension" AS ENUM ('OUTCOME_SELF_ASSESSMENT', 'CONTENT', 'TEACHING_METHOD', 'ASSESSMENT', 'LEARNING_SUPPORT', 'PRACTICE', 'OPEN_FEEDBACK');

ALTER TYPE "AuditAction" ADD VALUE 'COURSE_SURVEY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_SURVEY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_SURVEY_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_SURVEY_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_SURVEY_RESPONSE_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE 'COURSE_SURVEY_SUMMARY_GENERATED';
ALTER TYPE "AuditTargetType" ADD VALUE 'COURSE_SURVEY';
ALTER TYPE "AuditTargetType" ADD VALUE 'COURSE_SURVEY_RESPONSE';
ALTER TYPE "AuditTargetType" ADD VALUE 'COURSE_SURVEY_SUMMARY';
ALTER TYPE "NotificationType" ADD VALUE 'COURSE_SURVEY_PUBLISHED';
ALTER TYPE "NotificationSourceType" ADD VALUE 'COURSE_SURVEY';

CREATE TABLE "CourseSurvey" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "sourcePublishedSyllabusStructureId" TEXT,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    "status" "CourseSurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "CourseSurveyMode" NOT NULL DEFAULT 'ANONYMOUS',
    "opensAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseSurvey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "type" "CourseSurveyQuestionType" NOT NULL,
    "dimension" "CourseSurveyDimension" NOT NULL,
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "outcomeCode" VARCHAR(100),
    "outcomeTitle" VARCHAR(300),
    "sourceRefsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseSurveyQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSurveyParticipation" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseSurveyParticipation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "studentId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseSurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseSurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "scaleValue" INTEGER,
    "textValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseSurveyAnswer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CourseSurveyAnswer_value_check" CHECK (
      ("scaleValue" BETWEEN 1 AND 5 AND "textValue" IS NULL)
      OR ("scaleValue" IS NULL AND "textValue" IS NOT NULL)
    )
);

CREATE TABLE "CourseSurveySummaryRevision" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "inputFingerprint" CHAR(64) NOT NULL,
    "responseCount" INTEGER NOT NULL,
    "eligibleCount" INTEGER NOT NULL,
    "isSuppressed" BOOLEAN NOT NULL DEFAULT false,
    "statisticsJson" JSONB NOT NULL,
    "themesJson" JSONB NOT NULL,
    "ruleVersion" VARCHAR(100) NOT NULL,
    "aiStatus" VARCHAR(30) NOT NULL,
    "aiProvider" VARCHAR(100),
    "aiModel" VARCHAR(191),
    "promptVersion" VARCHAR(100),
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CourseSurveySummaryRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseSurvey_courseId_status_createdAt_idx" ON "CourseSurvey"("courseId", "status", "createdAt");
CREATE INDEX "CourseSurvey_classroomId_status_opensAt_dueAt_idx" ON "CourseSurvey"("classroomId", "status", "opensAt", "dueAt");
CREATE INDEX "CourseSurvey_teacherId_status_createdAt_idx" ON "CourseSurvey"("teacherId", "status", "createdAt");
CREATE INDEX "CourseSurvey_sourcePublishedSyllabusStructureId_idx" ON "CourseSurvey"("sourcePublishedSyllabusStructureId");
CREATE UNIQUE INDEX "CourseSurveyQuestion_surveyId_sortOrder_key" ON "CourseSurveyQuestion"("surveyId", "sortOrder");
CREATE INDEX "CourseSurveyQuestion_surveyId_dimension_idx" ON "CourseSurveyQuestion"("surveyId", "dimension");
CREATE INDEX "CourseSurveyQuestion_outcomeCode_idx" ON "CourseSurveyQuestion"("outcomeCode");
CREATE UNIQUE INDEX "CourseSurveyParticipation_surveyId_studentId_key" ON "CourseSurveyParticipation"("surveyId", "studentId");
CREATE INDEX "CourseSurveyParticipation_studentId_submittedAt_idx" ON "CourseSurveyParticipation"("studentId", "submittedAt");
CREATE INDEX "CourseSurveyParticipation_surveyId_submittedAt_idx" ON "CourseSurveyParticipation"("surveyId", "submittedAt");
CREATE UNIQUE INDEX "CourseSurveyResponse_surveyId_studentId_key" ON "CourseSurveyResponse"("surveyId", "studentId");
CREATE INDEX "CourseSurveyResponse_surveyId_submittedAt_idx" ON "CourseSurveyResponse"("surveyId", "submittedAt");
CREATE INDEX "CourseSurveyResponse_studentId_submittedAt_idx" ON "CourseSurveyResponse"("studentId", "submittedAt");
CREATE UNIQUE INDEX "CourseSurveyAnswer_responseId_questionId_key" ON "CourseSurveyAnswer"("responseId", "questionId");
CREATE INDEX "CourseSurveyAnswer_questionId_scaleValue_idx" ON "CourseSurveyAnswer"("questionId", "scaleValue");
CREATE UNIQUE INDEX "CourseSurveySummaryRevision_surveyId_revisionNumber_key" ON "CourseSurveySummaryRevision"("surveyId", "revisionNumber");
CREATE UNIQUE INDEX "CourseSurveySummaryRevision_surveyId_inputFingerprint_key" ON "CourseSurveySummaryRevision"("surveyId", "inputFingerprint");
CREATE INDEX "CourseSurveySummaryRevision_surveyId_generatedAt_idx" ON "CourseSurveySummaryRevision"("surveyId", "generatedAt");

ALTER TABLE "CourseSurvey" ADD CONSTRAINT "CourseSurvey_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseSurvey" ADD CONSTRAINT "CourseSurvey_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseSurvey" ADD CONSTRAINT "CourseSurvey_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseSurvey" ADD CONSTRAINT "CourseSurvey_sourcePublishedSyllabusStructureId_fkey" FOREIGN KEY ("sourcePublishedSyllabusStructureId") REFERENCES "PublishedSyllabusStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CourseSurveyQuestion" ADD CONSTRAINT "CourseSurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "CourseSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSurveyParticipation" ADD CONSTRAINT "CourseSurveyParticipation_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "CourseSurvey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseSurveyParticipation" ADD CONSTRAINT "CourseSurveyParticipation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseSurveyResponse" ADD CONSTRAINT "CourseSurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "CourseSurvey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseSurveyResponse" ADD CONSTRAINT "CourseSurveyResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseSurveyAnswer" ADD CONSTRAINT "CourseSurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "CourseSurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseSurveyAnswer" ADD CONSTRAINT "CourseSurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CourseSurveyQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseSurveySummaryRevision" ADD CONSTRAINT "CourseSurveySummaryRevision_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "CourseSurvey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
