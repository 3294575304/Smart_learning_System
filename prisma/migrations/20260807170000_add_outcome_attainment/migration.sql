-- CreateEnum
CREATE TYPE "OutcomeStudentStatus" AS ENUM ('INCLUDED', 'EXCLUDED_MISSING', 'EXCLUDED_EXEMPT');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'OUTCOME_ATTAINMENT_GENERATED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'OUTCOME_ATTAINMENT_RUN';

-- CreateTable
CREATE TABLE "CourseOutcomeAttainmentRun" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "gradebookId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "gradebookPublicationId" TEXT NOT NULL,
    "sourceSyllabusStructureId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "inputFingerprint" CHAR(64) NOT NULL,
    "calculationRuleVersion" VARCHAR(50) NOT NULL,
    "inputSnapshotJson" JSONB NOT NULL,
    "generatedById" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseOutcomeAttainmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseOutcomeAttainmentResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "outcomeCode" VARCHAR(100) NOT NULL,
    "outcomeTitle" VARCHAR(300) NOT NULL,
    "threshold" DECIMAL(5,2) NOT NULL,
    "meanScore" DECIMAL(8,4),
    "attainmentIndex" DECIMAL(8,4),
    "attained" BOOLEAN,
    "participantCount" INTEGER NOT NULL,
    "excludedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseOutcomeAttainmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentOutcomeAttainmentResult" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "gradeRevisionId" TEXT NOT NULL,
    "status" "OutcomeStudentStatus" NOT NULL,
    "score" DECIMAL(8,4),
    "attained" BOOLEAN,
    "evidenceJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentOutcomeAttainmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseOutcomeAttainmentRun_courseId_classroomId_calculatedA_idx" ON "CourseOutcomeAttainmentRun"("courseId", "classroomId", "calculatedAt");

-- CreateIndex
CREATE INDEX "CourseOutcomeAttainmentRun_schemeId_calculatedAt_idx" ON "CourseOutcomeAttainmentRun"("schemeId", "calculatedAt");

-- CreateIndex
CREATE INDEX "CourseOutcomeAttainmentRun_sourceSyllabusStructureId_idx" ON "CourseOutcomeAttainmentRun"("sourceSyllabusStructureId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOutcomeAttainmentRun_gradebookPublicationId_calculati_key" ON "CourseOutcomeAttainmentRun"("gradebookPublicationId", "calculationRuleVersion");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOutcomeAttainmentRun_gradebookId_versionNumber_key" ON "CourseOutcomeAttainmentRun"("gradebookId", "versionNumber");

-- CreateIndex
CREATE INDEX "CourseOutcomeAttainmentResult_outcomeId_createdAt_idx" ON "CourseOutcomeAttainmentResult"("outcomeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOutcomeAttainmentResult_runId_outcomeId_key" ON "CourseOutcomeAttainmentResult"("runId", "outcomeId");

-- CreateIndex
CREATE INDEX "StudentOutcomeAttainmentResult_studentId_createdAt_idx" ON "StudentOutcomeAttainmentResult"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentOutcomeAttainmentResult_gradeRevisionId_idx" ON "StudentOutcomeAttainmentResult"("gradeRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentOutcomeAttainmentResult_resultId_studentId_key" ON "StudentOutcomeAttainmentResult"("resultId", "studentId");

-- AddForeignKey
ALTER TABLE "CourseOutcomeAttainmentRun" ADD CONSTRAINT "CourseOutcomeAttainmentRun_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOutcomeAttainmentRun" ADD CONSTRAINT "CourseOutcomeAttainmentRun_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOutcomeAttainmentRun" ADD CONSTRAINT "CourseOutcomeAttainmentRun_gradebookId_fkey" FOREIGN KEY ("gradebookId") REFERENCES "CourseGradebook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOutcomeAttainmentRun" ADD CONSTRAINT "CourseOutcomeAttainmentRun_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "PublishedAssessmentScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOutcomeAttainmentRun" ADD CONSTRAINT "CourseOutcomeAttainmentRun_gradebookPublicationId_fkey" FOREIGN KEY ("gradebookPublicationId") REFERENCES "GradebookPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOutcomeAttainmentRun" ADD CONSTRAINT "CourseOutcomeAttainmentRun_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOutcomeAttainmentResult" ADD CONSTRAINT "CourseOutcomeAttainmentResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CourseOutcomeAttainmentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOutcomeAttainmentResult" ADD CONSTRAINT "CourseOutcomeAttainmentResult_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "PublishedCourseOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentOutcomeAttainmentResult" ADD CONSTRAINT "StudentOutcomeAttainmentResult_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "CourseOutcomeAttainmentResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentOutcomeAttainmentResult" ADD CONSTRAINT "StudentOutcomeAttainmentResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentOutcomeAttainmentResult" ADD CONSTRAINT "StudentOutcomeAttainmentResult_gradeRevisionId_fkey" FOREIGN KEY ("gradeRevisionId") REFERENCES "StudentCourseGradeRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CourseOutcomeAttainmentRun"
  ADD CONSTRAINT "CourseOutcomeAttainmentRun_version_check" CHECK ("versionNumber" > 0);
ALTER TABLE "CourseOutcomeAttainmentResult"
  ADD CONSTRAINT "CourseOutcomeAttainmentResult_counts_check" CHECK ("participantCount" >= 0 AND "excludedCount" >= 0),
  ADD CONSTRAINT "CourseOutcomeAttainmentResult_scores_check" CHECK (("meanScore" IS NULL OR ("meanScore" >= 0 AND "meanScore" <= 100)) AND "threshold" > 0 AND "threshold" <= 100);
ALTER TABLE "StudentOutcomeAttainmentResult"
  ADD CONSTRAINT "StudentOutcomeAttainmentResult_status_score_check" CHECK (("status" = 'INCLUDED' AND "score" IS NOT NULL AND "attained" IS NOT NULL) OR ("status" <> 'INCLUDED' AND "score" IS NULL AND "attained" IS NULL));
