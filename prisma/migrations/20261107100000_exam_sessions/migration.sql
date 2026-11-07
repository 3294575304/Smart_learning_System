-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('MIDTERM', 'FINAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'EXAM_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'EXAM_CANCELLED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'EXAM_SESSION';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "examSessionId" TEXT;

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestFingerprint" CHAR(64) NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "questionCategoryId" TEXT NOT NULL,
    "type" "ExamType" NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allowedSwitches" INTEGER NOT NULL DEFAULT 2,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamQuestionUse" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionCategoryId" TEXT NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamQuestionUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSwitchEvent" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSwitchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamSession_requestId_key" ON "ExamSession"("requestId");

-- CreateIndex
CREATE INDEX "ExamSession_teacherId_startsAt_idx" ON "ExamSession"("teacherId", "startsAt");

-- CreateIndex
CREATE INDEX "ExamSession_questionCategoryId_startsAt_idx" ON "ExamSession"("questionCategoryId", "startsAt");

-- CreateIndex
CREATE INDEX "ExamQuestionUse_questionCategoryId_questionId_startsAt_idx" ON "ExamQuestionUse"("questionCategoryId", "questionId", "startsAt");

-- CreateIndex
CREATE INDEX "ExamQuestionUse_questionCategoryId_contentHash_startsAt_idx" ON "ExamQuestionUse"("questionCategoryId", "contentHash", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestionUse_examSessionId_questionId_key" ON "ExamQuestionUse"("examSessionId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSwitchEvent_eventKey_key" ON "ExamSwitchEvent"("eventKey");

-- CreateIndex
CREATE INDEX "ExamSwitchEvent_submissionId_observedAt_idx" ON "ExamSwitchEvent"("submissionId", "observedAt");

-- CreateIndex
CREATE INDEX "Assignment_examSessionId_idx" ON "Assignment"("examSessionId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_questionCategoryId_fkey" FOREIGN KEY ("questionCategoryId") REFERENCES "QuestionCourseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestionUse" ADD CONSTRAINT "ExamQuestionUse_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestionUse" ADD CONSTRAINT "ExamQuestionUse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSwitchEvent" ADD CONSTRAINT "ExamSwitchEvent_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSwitchEvent" ADD CONSTRAINT "ExamSwitchEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
