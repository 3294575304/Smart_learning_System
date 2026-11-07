ALTER TABLE "PracticeSetManagement"
  ADD COLUMN "draftData" JSONB,
  ADD COLUMN "draftRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "draftSavedAt" TIMESTAMP(3);
