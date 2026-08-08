CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "BackgroundJob" (
  "id" TEXT NOT NULL,
  "type" VARCHAR(100) NOT NULL,
  "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT,
  "courseId" TEXT,
  "idempotencyKey" VARCHAR(191) NOT NULL,
  "inputFingerprint" CHAR(64) NOT NULL,
  "input" JSONB NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "currentLeaseId" VARCHAR(64),
  "errorCode" VARCHAR(100),
  "retryable" BOOLEAN,
  "result" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackgroundJob_progress_check" CHECK ("progress" BETWEEN 0 AND 100),
  CONSTRAINT "BackgroundJob_attempts_check" CHECK (
    "attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 10 AND "attemptCount" <= "maxAttempts"
  )
);

CREATE TABLE "BackgroundJobAttempt" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "leaseId" VARCHAR(64) NOT NULL,
  "workerId" VARCHAR(191) NOT NULL,
  "executorVersion" VARCHAR(100) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "errorCode" VARCHAR(100),
  "retryable" BOOLEAN,
  "resourceUsage" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackgroundJobAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackgroundJobAttempt_number_check" CHECK ("attemptNumber" > 0),
  CONSTRAINT "BackgroundJobAttempt_expiry_check" CHECK ("expiresAt" > "startedAt")
);

CREATE INDEX "BackgroundJob_status_nextAttemptAt_createdAt_idx" ON "BackgroundJob"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "BackgroundJob_courseId_status_createdAt_idx" ON "BackgroundJob"("courseId", "status", "createdAt");
CREATE INDEX "BackgroundJob_requestedById_createdAt_idx" ON "BackgroundJob"("requestedById", "createdAt");
CREATE INDEX "BackgroundJob_currentLeaseId_idx" ON "BackgroundJob"("currentLeaseId");
CREATE UNIQUE INDEX "BackgroundJob_type_idempotencyKey_key" ON "BackgroundJob"("type", "idempotencyKey");
CREATE UNIQUE INDEX "BackgroundJobAttempt_leaseId_key" ON "BackgroundJobAttempt"("leaseId");
CREATE UNIQUE INDEX "BackgroundJobAttempt_jobId_attemptNumber_key" ON "BackgroundJobAttempt"("jobId", "attemptNumber");
CREATE INDEX "BackgroundJobAttempt_jobId_startedAt_idx" ON "BackgroundJobAttempt"("jobId", "startedAt");
CREATE INDEX "BackgroundJobAttempt_expiresAt_completedAt_idx" ON "BackgroundJobAttempt"("expiresAt", "completedAt");
CREATE INDEX "BackgroundJobAttempt_workerId_startedAt_idx" ON "BackgroundJobAttempt"("workerId", "startedAt");

ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackgroundJobAttempt" ADD CONSTRAINT "BackgroundJobAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
