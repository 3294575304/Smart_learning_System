ALTER TABLE "SyllabusParseDraft"
  ADD COLUMN "attemptId" VARCHAR(36),
  ADD COLUMN "providerRequestId" VARCHAR(191),
  ADD COLUMN "finishReason" VARCHAR(50),
  ADD COLUMN "promptTokens" INTEGER,
  ADD COLUMN "completionTokens" INTEGER,
  ADD COLUMN "totalTokens" INTEGER,
  ADD COLUMN "responseLength" INTEGER,
  ADD COLUMN "providerDurationMs" INTEGER,
  ADD COLUMN "jsonParseDurationMs" INTEGER,
  ADD COLUMN "validationDurationMs" INTEGER,
  ADD COLUMN "errorPhase" VARCHAR(30);

CREATE INDEX "SyllabusParseDraft_attemptId_idx" ON "SyllabusParseDraft"("attemptId");
