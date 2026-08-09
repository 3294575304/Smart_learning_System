-- Iteration five B2 adds asynchronous judge attempts without rewriting history.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROGRAMMING_ATTEMPT_REJUDGED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PROGRAMMING_ATTEMPT_REVOKED';

CREATE TYPE "ProgrammingAttemptKind" AS ENUM ('PUBLIC_RUN', 'FORMAL_JUDGE');
CREATE TYPE "ProgrammingAttemptStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'SYSTEM_ERROR', 'CANCELLED');
CREATE TYPE "ProgrammingJudgeErrorType" AS ENUM ('NONE', 'WRONG_ANSWER', 'SYNTAX_ERROR', 'RUNTIME_ERROR', 'TIME_LIMIT', 'MEMORY_LIMIT', 'OUTPUT_LIMIT', 'PROCESS_LIMIT', 'SECURITY_VIOLATION', 'SYSTEM_ERROR', 'CANCELLED');

ALTER TABLE "StudentAnswer" ADD COLUMN "assessmentRevisionKey" VARCHAR(191);

CREATE TABLE "ProgrammingAttempt" (
    "id" TEXT NOT NULL,
    "studentAnswerId" TEXT NOT NULL,
    "assignmentQuestionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "configSnapshotId" TEXT NOT NULL,
    "kind" "ProgrammingAttemptKind" NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "inputFingerprint" CHAR(64) NOT NULL,
    "ruleVersion" VARCHAR(100) NOT NULL,
    "status" "ProgrammingAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "backgroundJobId" TEXT,
    "score" DECIMAL(8,2),
    "maxScore" DECIMAL(8,2) NOT NULL,
    "overallErrorType" "ProgrammingJudgeErrorType",
    "safeErrorSummary" VARCHAR(500),
    "supersedesAttemptId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgrammingAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProgrammingTestCaseResult" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "caseIndex" INTEGER NOT NULL,
    "visibility" "ProgrammingTestVisibility" NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "earnedPoints" DECIMAL(8,2) NOT NULL,
    "maxPoints" DECIMAL(8,2) NOT NULL,
    "errorType" "ProgrammingJudgeErrorType" NOT NULL,
    "safeErrorSummary" VARCHAR(500),
    "stdout" TEXT,
    "stderr" TEXT,
    "resourceUsage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgrammingTestCaseResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProgrammingAttempt_backgroundJobId_key" ON "ProgrammingAttempt"("backgroundJobId");
CREATE UNIQUE INDEX "ProgrammingAttempt_supersedesAttemptId_key" ON "ProgrammingAttempt"("supersedesAttemptId");
CREATE UNIQUE INDEX "ProgrammingAttempt_studentAnswerId_kind_revisionNumber_key" ON "ProgrammingAttempt"("studentAnswerId", "kind", "revisionNumber");
CREATE INDEX "ProgrammingAttempt_studentId_createdAt_idx" ON "ProgrammingAttempt"("studentId", "createdAt");
CREATE INDEX "ProgrammingAttempt_assignmentQuestionId_createdAt_idx" ON "ProgrammingAttempt"("assignmentQuestionId", "createdAt");
CREATE INDEX "ProgrammingAttempt_status_createdAt_idx" ON "ProgrammingAttempt"("status", "createdAt");
CREATE INDEX "ProgrammingAttempt_inputFingerprint_idx" ON "ProgrammingAttempt"("inputFingerprint");
CREATE UNIQUE INDEX "ProgrammingTestCaseResult_attemptId_testCaseId_key" ON "ProgrammingTestCaseResult"("attemptId", "testCaseId");
CREATE UNIQUE INDEX "ProgrammingTestCaseResult_attemptId_caseIndex_key" ON "ProgrammingTestCaseResult"("attemptId", "caseIndex");
CREATE INDEX "ProgrammingTestCaseResult_attemptId_visibility_caseIndex_idx" ON "ProgrammingTestCaseResult"("attemptId", "visibility", "caseIndex");

ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_studentAnswerId_fkey" FOREIGN KEY ("studentAnswerId") REFERENCES "StudentAnswer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_configSnapshotId_fkey" FOREIGN KEY ("configSnapshotId") REFERENCES "AssignmentProgrammingConfigSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_backgroundJobId_fkey" FOREIGN KEY ("backgroundJobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingAttempt" ADD CONSTRAINT "ProgrammingAttempt_supersedesAttemptId_fkey" FOREIGN KEY ("supersedesAttemptId") REFERENCES "ProgrammingAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingTestCaseResult" ADD CONSTRAINT "ProgrammingTestCaseResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ProgrammingAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammingTestCaseResult" ADD CONSTRAINT "ProgrammingTestCaseResult_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "ProgrammingTestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
