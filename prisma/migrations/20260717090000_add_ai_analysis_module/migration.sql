ALTER TABLE "StudentAnswer"
ADD COLUMN "responseTimeMs" INTEGER;

ALTER TABLE "StudentAnswer"
ADD CONSTRAINT "StudentAnswer_responseTimeMs_check"
CHECK ("responseTimeMs" IS NULL OR "responseTimeMs" BETWEEN 0 AND 86400000);
