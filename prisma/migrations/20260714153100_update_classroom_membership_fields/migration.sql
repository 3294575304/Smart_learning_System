-- Existing classes keep the previous MVP behavior and do not allow students
-- to leave until their teacher explicitly enables it.
ALTER TABLE "Classroom"
ADD COLUMN "allowStudentLeave" BOOLEAN NOT NULL DEFAULT false;

-- The timestamp now represents either kind of membership termination.
ALTER TABLE "ClassMembership"
RENAME COLUMN "removedAt" TO "endedAt";

ALTER TABLE "ClassMembership"
DROP CONSTRAINT "ClassMembership_status_timestamps_check";

ALTER TABLE "ClassMembership"
ADD CONSTRAINT "ClassMembership_status_timestamps_check" CHECK (
  ("status" = 'ACTIVE' AND "endedAt" IS NULL)
  OR ("status" IN ('LEFT', 'REMOVED') AND "endedAt" IS NOT NULL)
);
