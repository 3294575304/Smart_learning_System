CREATE TYPE "AttendanceSignInMethod" AS ENUM ('DIRECT', 'LOCATION', 'CODE', 'GRAPHIC');

ALTER TABLE "AttendanceSession"
  ADD COLUMN "signInMethod" "AttendanceSignInMethod" NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "locationLatitude" DOUBLE PRECISION,
  ADD COLUMN "locationLongitude" DOUBLE PRECISION,
  ADD COLUMN "locationRadiusMeters" INTEGER,
  ADD COLUMN "challengeHash" VARCHAR(64);

ALTER TABLE "AttendanceRecord"
  ADD COLUMN "challengeAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "challengeLockedUntil" TIMESTAMP(3);

ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_location_config_check"
  CHECK (
    ("signInMethod" = 'LOCATION'
      AND "locationLatitude" IS NOT NULL
      AND "locationLongitude" IS NOT NULL
      AND "locationRadiusMeters" BETWEEN 25 AND 1000
      AND "locationLatitude" BETWEEN -90 AND 90
      AND "locationLongitude" BETWEEN -180 AND 180)
    OR
    ("signInMethod" <> 'LOCATION'
      AND "locationLatitude" IS NULL
      AND "locationLongitude" IS NULL
      AND "locationRadiusMeters" IS NULL)
  ),
  ADD CONSTRAINT "AttendanceSession_challenge_config_check"
  CHECK ("signInMethod" IN ('CODE', 'GRAPHIC') OR "challengeHash" IS NULL);

ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_challenge_attempts_check"
  CHECK ("challengeAttempts" >= 0);
