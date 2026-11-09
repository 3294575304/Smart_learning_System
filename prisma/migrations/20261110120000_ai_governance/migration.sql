CREATE TABLE "AIQuotaReservation" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "schoolId" TEXT,
  "capability" TEXT NOT NULL,
  "units" INTEGER NOT NULL CHECK ("units" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AIQuotaReservation_actorId_capability_createdAt_idx" ON "AIQuotaReservation" ("actorId", "capability", "createdAt");
CREATE INDEX "AIQuotaReservation_schoolId_capability_createdAt_idx" ON "AIQuotaReservation" ("schoolId", "capability", "createdAt");

CREATE TABLE "AIProviderAttemptLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "schoolId" TEXT,
  "capability" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "errorCode" TEXT,
  "requestId" TEXT,
  "latencyMs" INTEGER NOT NULL,
  "totalTokens" INTEGER,
  "wouldLimit" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AIProviderAttemptLog_schoolId_createdAt_idx" ON "AIProviderAttemptLog" ("schoolId", "createdAt");
CREATE INDEX "AIProviderAttemptLog_createdAt_idx" ON "AIProviderAttemptLog" ("createdAt");
