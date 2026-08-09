-- Iteration five B1 is additive. Existing questions and assignments are not backfilled.
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'PYTHON_PROGRAMMING';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROGRAMMING_CONFIG_REVISION_CREATED';

CREATE TYPE "ProgrammingTestVisibility" AS ENUM ('PUBLIC', 'HIDDEN');

CREATE TABLE "ProgrammingQuestionConfigRevision" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "standardCode" TEXT NOT NULL,
    "starterCode" TEXT NOT NULL,
    "totalPoints" DECIMAL(8,2) NOT NULL,
    "cpuTimeMs" INTEGER NOT NULL,
    "wallTimeMs" INTEGER NOT NULL,
    "memoryBytes" INTEGER NOT NULL,
    "outputBytes" INTEGER NOT NULL,
    "processCount" INTEGER NOT NULL,
    "testCasesHash" CHAR(64) NOT NULL,
    "configurationHash" CHAR(64) NOT NULL,
    "executorRuleVersion" VARCHAR(100) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgrammingQuestionConfigRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProgrammingTestCase" (
    "id" TEXT NOT NULL,
    "configRevisionId" TEXT NOT NULL,
    "visibility" "ProgrammingTestVisibility" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "stdin" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,
    "points" DECIMAL(8,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgrammingTestCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssignmentProgrammingConfigSnapshot" (
    "id" TEXT NOT NULL,
    "assignmentQuestionId" TEXT NOT NULL,
    "configRevisionId" TEXT NOT NULL,
    "configRevisionNumber" INTEGER NOT NULL,
    "configurationHash" CHAR(64) NOT NULL,
    "testCasesHash" CHAR(64) NOT NULL,
    "executorRuleVersion" VARCHAR(100) NOT NULL,
    "cpuTimeMs" INTEGER NOT NULL,
    "wallTimeMs" INTEGER NOT NULL,
    "memoryBytes" INTEGER NOT NULL,
    "outputBytes" INTEGER NOT NULL,
    "processCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssignmentProgrammingConfigSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProgrammingQuestionConfigRevision_questionId_revisionNumber_key" ON "ProgrammingQuestionConfigRevision"("questionId", "revisionNumber");
CREATE UNIQUE INDEX "ProgrammingQuestionConfigRevision_questionId_configurationHash_key" ON "ProgrammingQuestionConfigRevision"("questionId", "configurationHash");
CREATE INDEX "ProgrammingQuestionConfigRevision_questionId_createdAt_idx" ON "ProgrammingQuestionConfigRevision"("questionId", "createdAt");
CREATE INDEX "ProgrammingQuestionConfigRevision_createdById_createdAt_idx" ON "ProgrammingQuestionConfigRevision"("createdById", "createdAt");
CREATE UNIQUE INDEX "ProgrammingTestCase_configRevisionId_sortOrder_key" ON "ProgrammingTestCase"("configRevisionId", "sortOrder");
CREATE INDEX "ProgrammingTestCase_configRevisionId_visibility_sortOrder_idx" ON "ProgrammingTestCase"("configRevisionId", "visibility", "sortOrder");
CREATE UNIQUE INDEX "AssignmentProgrammingConfigSnapshot_assignmentQuestionId_key" ON "AssignmentProgrammingConfigSnapshot"("assignmentQuestionId");
CREATE INDEX "AssignmentProgrammingConfigSnapshot_configRevisionId_idx" ON "AssignmentProgrammingConfigSnapshot"("configRevisionId");
CREATE INDEX "AssignmentProgrammingConfigSnapshot_configurationHash_idx" ON "AssignmentProgrammingConfigSnapshot"("configurationHash");

ALTER TABLE "ProgrammingQuestionConfigRevision" ADD CONSTRAINT "ProgrammingQuestionConfigRevision_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingQuestionConfigRevision" ADD CONSTRAINT "ProgrammingQuestionConfigRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingTestCase" ADD CONSTRAINT "ProgrammingTestCase_configRevisionId_fkey" FOREIGN KEY ("configRevisionId") REFERENCES "ProgrammingQuestionConfigRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentProgrammingConfigSnapshot" ADD CONSTRAINT "AssignmentProgrammingConfigSnapshot_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentProgrammingConfigSnapshot" ADD CONSTRAINT "AssignmentProgrammingConfigSnapshot_configRevisionId_fkey" FOREIGN KEY ("configRevisionId") REFERENCES "ProgrammingQuestionConfigRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
