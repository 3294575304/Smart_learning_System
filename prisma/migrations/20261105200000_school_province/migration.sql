-- Existing schools remain unlocated unless their location is known.
ALTER TABLE "School" ADD COLUMN "provinceCode" CHAR(6);
CREATE INDEX "School_provinceCode_idx" ON "School"("provinceCode");

-- The current deployment's explicitly bound university is in Jiangsu.
UPDATE "School" SET "provinceCode" = '320000'
WHERE "name" = '南京信息工程大学' AND "provinceCode" IS NULL;
