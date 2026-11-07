-- Preserve administrator IDs and their historical business/audit relations
-- when removing their login accounts. Existing users remain undeleted.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Rollback: drop deletedAt only after deciding how archived accounts should
-- be restored; deleted accounts remain inactive and have no login email.
