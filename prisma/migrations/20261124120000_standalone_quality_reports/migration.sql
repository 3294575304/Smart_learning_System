ALTER TABLE "CourseQualityReport" ALTER COLUMN "courseId" DROP NOT NULL;
ALTER TABLE "CourseQualityReport" ADD COLUMN "standaloneKey" CHAR(64);
ALTER TABLE "CourseQualityReport" ADD COLUMN "standaloneVersion" INTEGER;
CREATE UNIQUE INDEX "CourseQualityReport_standaloneKey_key" ON "CourseQualityReport"("standaloneKey");
CREATE UNIQUE INDEX "CourseQualityReport_requestedById_standaloneVersion_key" ON "CourseQualityReport"("requestedById", "standaloneVersion");
ALTER TABLE "CourseQualityReport" ADD CONSTRAINT "CourseQualityReport_scope_check" CHECK (("courseId" IS NOT NULL AND "standaloneKey" IS NULL AND "standaloneVersion" IS NULL) OR ("courseId" IS NULL AND "standaloneKey" IS NOT NULL AND "standaloneVersion" IS NOT NULL));
