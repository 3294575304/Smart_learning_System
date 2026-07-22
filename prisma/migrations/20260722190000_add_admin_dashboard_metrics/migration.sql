-- Store the already measured analysis latency in an aggregate-friendly column.
ALTER TABLE "AIAnalysis" ADD COLUMN "latencyMs" INTEGER;

-- Backfill only latency values that were previously persisted as real numeric JSON data.
UPDATE "AIAnalysis"
SET "latencyMs" = ("inputMetrics" ->> 'latencyMs')::INTEGER
WHERE jsonb_typeof("inputMetrics" -> 'latencyMs') = 'number'
  AND ("inputMetrics" ->> 'latencyMs')::INTEGER >= 0;

ALTER TABLE "AIAnalysis"
ADD CONSTRAINT "AIAnalysis_latencyMs_check"
CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0);

-- Dashboard time-window indexes. These support global aggregates without changing business rows.
CREATE INDEX "Assignment_status_publishedAt_idx"
ON "Assignment"("status", "publishedAt");

CREATE INDEX "Submission_status_submittedAt_idx"
ON "Submission"("status", "submittedAt");

CREATE INDEX "StudentAnswer_createdAt_idx"
ON "StudentAnswer"("createdAt");

CREATE INDEX "AIAnalysis_status_createdAt_idx"
ON "AIAnalysis"("status", "createdAt");

CREATE INDEX "PersonalizedRecommendation_createdAt_idx"
ON "PersonalizedRecommendation"("createdAt");
