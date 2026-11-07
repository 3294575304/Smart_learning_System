ALTER TABLE "PracticeSetManagement"
  ADD COLUMN "purgedAt" TIMESTAMP(3),
  ADD CONSTRAINT "PracticeSetManagement_purge_trash_check"
    CHECK ("purgedAt" IS NULL OR "trashedAt" IS NOT NULL);
