-- AI generates an immutable draft first. A course-owning teacher must review
-- and approve edited narrative text before a formal DOCX becomes available.
CREATE TYPE "QualityReportReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED');

ALTER TYPE "AuditAction" ADD VALUE 'QUALITY_REPORT_APPROVED';

ALTER TABLE "CourseQualityReport"
  ADD COLUMN "reviewStatus" "QualityReportReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "reviewedNarrativeJson" JSONB,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewComment" VARCHAR(1000),
  ADD COLUMN "approvedDocxStorageKey" VARCHAR(191),
  ADD COLUMN "approvedDocxFileName" VARCHAR(255),
  ADD COLUMN "approvedDocxSizeBytes" INTEGER,
  ADD COLUMN "approvedDocxChecksumSha256" CHAR(64);

CREATE UNIQUE INDEX "CourseQualityReport_approvedDocxStorageKey_key"
  ON "CourseQualityReport"("approvedDocxStorageKey");
CREATE INDEX "CourseQualityReport_reviewedById_reviewedAt_idx"
  ON "CourseQualityReport"("reviewedById", "reviewedAt");
CREATE INDEX "CourseQualityReport_courseId_reviewStatus_createdAt_idx"
  ON "CourseQualityReport"("courseId", "reviewStatus", "createdAt");

ALTER TABLE "CourseQualityReport"
  ADD CONSTRAINT "CourseQualityReport_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
