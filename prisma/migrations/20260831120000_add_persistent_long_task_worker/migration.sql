-- Persist the execution link for every AI/document long task so an independent
-- worker can recover work after the Web process exits.
ALTER TYPE "AIQuestionMappingBatchStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'READY';
ALTER TYPE "AIQuestionMappingBatchStatus" ADD VALUE IF NOT EXISTS 'PROCESSING' BEFORE 'READY';

ALTER TABLE "SyllabusParseDraft" ADD COLUMN "backgroundJobId" TEXT;
ALTER TABLE "KnowledgeGraphDraft" ADD COLUMN "backgroundJobId" TEXT;
ALTER TABLE "KnowledgeGraphDraft" ADD COLUMN "attemptId" VARCHAR(36);
ALTER TABLE "AIQuestionMappingBatch" ADD COLUMN "backgroundJobId" TEXT;

-- Adopt drafts left PENDING/PROCESSING by the former Web-after execution path.
-- The worker will claim these records after deployment without a user retry.
INSERT INTO "BackgroundJob" (
  "id", "type", "status", "requestedById", "courseId", "idempotencyKey",
  "inputFingerprint", "input", "maxAttempts", "nextAttemptAt", "createdAt", "updatedAt"
)
SELECT
  'kg_' || md5(random()::text || clock_timestamp()::text || d."id"),
  'KNOWLEDGE_GRAPH_GENERATION', 'PENDING', d."requestedById", d."courseId",
  'legacy:' || d."id", md5(d."id" || ':kg:1') || md5(d."id" || ':kg:2'),
  jsonb_build_object(
    'draftId', d."id", 'teacherId', d."requestedById", 'courseId', d."courseId",
    'context', jsonb_build_object('ipAddress', NULL, 'userAgent', NULL)
  ),
  3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "KnowledgeGraphDraft" d
WHERE d."status" IN ('PENDING', 'PROCESSING');

UPDATE "KnowledgeGraphDraft" d
SET "backgroundJobId" = j."id", "status" = 'PENDING', "startedAt" = NULL
FROM "BackgroundJob" j
WHERE j."type" = 'KNOWLEDGE_GRAPH_GENERATION'
  AND j."idempotencyKey" = 'legacy:' || d."id"
  AND d."backgroundJobId" IS NULL;

INSERT INTO "BackgroundJob" (
  "id", "type", "status", "requestedById", "courseId", "idempotencyKey",
  "inputFingerprint", "input", "maxAttempts", "nextAttemptAt", "createdAt", "updatedAt"
)
SELECT
  'sp_' || md5(random()::text || clock_timestamp()::text || d."id"),
  'SYLLABUS_PARSE', 'PENDING', d."requestedById", d."courseId",
  'legacy:' || d."id", md5(d."id" || ':sp:1') || md5(d."id" || ':sp:2'),
  jsonb_build_object(
    'draftId', d."id", 'teacherId', d."requestedById", 'courseId', d."courseId"
  ),
  3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SyllabusParseDraft" d
WHERE d."status" IN ('PENDING', 'PROCESSING');

UPDATE "SyllabusParseDraft" d
SET "backgroundJobId" = j."id", "status" = 'PENDING', "startedAt" = NULL,
    "attemptId" = NULL
FROM "BackgroundJob" j
WHERE j."type" = 'SYLLABUS_PARSE'
  AND j."idempotencyKey" = 'legacy:' || d."id"
  AND d."backgroundJobId" IS NULL;

CREATE UNIQUE INDEX "SyllabusParseDraft_backgroundJobId_key"
  ON "SyllabusParseDraft"("backgroundJobId");
CREATE UNIQUE INDEX "KnowledgeGraphDraft_backgroundJobId_key"
  ON "KnowledgeGraphDraft"("backgroundJobId");
CREATE UNIQUE INDEX "AIQuestionMappingBatch_backgroundJobId_key"
  ON "AIQuestionMappingBatch"("backgroundJobId");

ALTER TABLE "SyllabusParseDraft"
  ADD CONSTRAINT "SyllabusParseDraft_backgroundJobId_fkey"
  FOREIGN KEY ("backgroundJobId") REFERENCES "BackgroundJob"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGraphDraft"
  ADD CONSTRAINT "KnowledgeGraphDraft_backgroundJobId_fkey"
  FOREIGN KEY ("backgroundJobId") REFERENCES "BackgroundJob"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestionMappingBatch"
  ADD CONSTRAINT "AIQuestionMappingBatch_backgroundJobId_fkey"
  FOREIGN KEY ("backgroundJobId") REFERENCES "BackgroundJob"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
