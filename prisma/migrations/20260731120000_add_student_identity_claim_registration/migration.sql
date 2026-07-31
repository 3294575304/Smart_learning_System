CREATE TYPE "StudentIdentityStatus" AS ENUM ('PENDING', 'ACTIVATED', 'DISABLED');

CREATE TABLE "StudentIdentity" (
    "id" TEXT NOT NULL,
    "studentNo" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254),
    "status" "StudentIdentityStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentIdentityClassroomAssignment" (
    "id" TEXT NOT NULL,
    "studentIdentityId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "sourceBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentIdentityClassroomAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StudentImportRow" ADD COLUMN "studentIdentityId" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "UserProfile"
    WHERE "studentNo" IS NOT NULL
    GROUP BY upper(btrim("studentNo"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Student numbers collide after trim and uppercase normalization';
  END IF;
END $$;

UPDATE "UserProfile"
SET "studentNo" = upper(btrim("studentNo"))
WHERE "studentNo" IS NOT NULL;

INSERT INTO "StudentIdentity" (
    "id",
    "studentNo",
    "name",
    "email",
    "status",
    "userId",
    "createdAt",
    "updatedAt"
)
SELECT
    'identity_' || "UserProfile"."id",
    "UserProfile"."studentNo",
    btrim("UserProfile"."displayName"),
    "User"."email",
    'ACTIVATED'::"StudentIdentityStatus",
    "UserProfile"."userId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "UserProfile"
JOIN "User" ON "User"."id" = "UserProfile"."userId"
WHERE "UserProfile"."studentNo" IS NOT NULL;

CREATE UNIQUE INDEX "StudentIdentity_studentNo_key" ON "StudentIdentity"("studentNo");
CREATE UNIQUE INDEX "StudentIdentity_userId_key" ON "StudentIdentity"("userId");
CREATE INDEX "StudentIdentity_status_createdAt_idx" ON "StudentIdentity"("status", "createdAt");
CREATE UNIQUE INDEX "StudentIdentityClassroomAssignment_studentIdentityId_classroomId_key"
ON "StudentIdentityClassroomAssignment"("studentIdentityId", "classroomId");
CREATE INDEX "StudentIdentityClassroomAssignment_classroomId_idx"
ON "StudentIdentityClassroomAssignment"("classroomId");
CREATE INDEX "StudentIdentityClassroomAssignment_sourceBatchId_idx"
ON "StudentIdentityClassroomAssignment"("sourceBatchId");
CREATE INDEX "StudentImportRow_studentIdentityId_idx" ON "StudentImportRow"("studentIdentityId");

ALTER TABLE "StudentIdentity"
ADD CONSTRAINT "StudentIdentity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentIdentityClassroomAssignment"
ADD CONSTRAINT "StudentIdentityClassroomAssignment_studentIdentityId_fkey"
FOREIGN KEY ("studentIdentityId") REFERENCES "StudentIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentIdentityClassroomAssignment"
ADD CONSTRAINT "StudentIdentityClassroomAssignment_classroomId_fkey"
FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentIdentityClassroomAssignment"
ADD CONSTRAINT "StudentIdentityClassroomAssignment_sourceBatchId_fkey"
FOREIGN KEY ("sourceBatchId") REFERENCES "StudentImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentImportRow"
ADD CONSTRAINT "StudentImportRow_studentIdentityId_fkey"
FOREIGN KEY ("studentIdentityId") REFERENCES "StudentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
