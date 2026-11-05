ALTER TABLE "School" ADD COLUMN "logoStorageKey" TEXT;

-- Existing remote logo URLs remain in logoUrl. Uploaded emblems use the
-- private storage key column and are served through the authenticated route.
-- Rollback: drop logoStorageKey after deciding whether uploaded emblem files
-- should be retained for a future migration or deleted from private storage.
