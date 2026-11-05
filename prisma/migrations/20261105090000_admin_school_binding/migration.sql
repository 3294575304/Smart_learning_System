-- Legacy installations were single-school deployments; existing administrator
-- accounts are initialized to the current institution so they remain usable.
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "School_key_key" ON "School"("key");
CREATE INDEX "School_name_idx" ON "School"("name");

INSERT INTO "School" ("id", "key", "name", "logoUrl", "updatedAt")
VALUES (
    'school_nuist',
    'nuist',
    '南京信息工程大学',
    'https://p1.itc.cn/q_70/images03/20221007/90be616a8b134f61b24eb2694f52c94e.png',
    CURRENT_TIMESTAMP
);

ALTER TABLE "User" ADD COLUMN "schoolId" TEXT;

UPDATE "User"
SET "schoolId" = 'school_nuist'
WHERE "role" = 'ADMIN' AND "schoolId" IS NULL;

CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");

ALTER TABLE "User"
ADD CONSTRAINT "User_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_admin_school_required"
CHECK ("role" <> 'ADMIN' OR "schoolId" IS NOT NULL);

-- Rollback: drop the check and foreign-key constraints, then the User index and
-- schoolId column, followed by the School index and table. This removes only the
-- new institution links; user accounts and all other account data are retained.
