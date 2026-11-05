ALTER TABLE "School" ADD COLUMN "nameImageStorageKey" TEXT;

-- Rollback: drop nameImageStorageKey after deciding whether uploaded school
-- name artwork should be retained for a future migration or deleted.
