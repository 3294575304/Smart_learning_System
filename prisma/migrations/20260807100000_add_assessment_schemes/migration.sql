CREATE TYPE "AssessmentComponentType" AS ENUM (
  'REGULAR_PERFORMANCE',
  'COURSE_ASSIGNMENT',
  'MIDTERM_EXAM',
  'COURSE_EXPERIMENT',
  'FINAL_EXAM',
  'ATTENDANCE',
  'OTHER'
);

CREATE TYPE "GradeSourceType" AS ENUM (
  'PLATFORM_ASSIGNMENT',
  'ATTENDANCE',
  'MANUAL',
  'TEMPLATE_IMPORT'
);

ALTER TYPE "AuditAction" ADD VALUE 'ASSESSMENT_SCHEME_DRAFT_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'ASSESSMENT_SCHEME_REVIEW_SAVED';
ALTER TYPE "AuditAction" ADD VALUE 'ASSESSMENT_SCHEME_PUBLISHED';

ALTER TYPE "AuditTargetType" ADD VALUE 'ASSESSMENT_SCHEME_DRAFT';
ALTER TYPE "AuditTargetType" ADD VALUE 'ASSESSMENT_SCHEME_REVIEW';
ALTER TYPE "AuditTargetType" ADD VALUE 'ASSESSMENT_SCHEME_VERSION';

ALTER TABLE "Course"
  ADD COLUMN "currentPublishedAssessmentSchemeId" TEXT;

CREATE TABLE "AssessmentSchemeDraft" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sourcePublishedSyllabusStructureId" TEXT,
  "createdById" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  "structureJson" JSONB NOT NULL,
  "sourceFingerprint" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentSchemeDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentSchemeDraft_revisionNumber_check"
    CHECK ("revisionNumber" > 0)
);

CREATE TABLE "AssessmentSchemeReviewRevision" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sourcePublishedSyllabusStructureId" TEXT,
  "editedById" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "structureJson" JSONB NOT NULL,
  "sourceFingerprint" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentSchemeReviewRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentSchemeReviewRevision_revisionNumber_check"
    CHECK ("revisionNumber" > 0)
);

CREATE TABLE "PublishedAssessmentScheme" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "sourcePublishedSyllabusStructureId" TEXT,
  "reviewRevisionId" TEXT NOT NULL,
  "publishedById" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "structureJson" JSONB NOT NULL,
  "sourceFingerprint" CHAR(64) NOT NULL,
  "calculationRuleVersion" VARCHAR(50) NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishedAssessmentScheme_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublishedAssessmentScheme_versionNumber_check"
    CHECK ("versionNumber" > 0)
);

CREATE TABLE "PublishedCourseOutcome" (
  "id" TEXT NOT NULL,
  "schemeId" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "description" TEXT NOT NULL,
  "attainmentThreshold" DECIMAL(5,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "sourceJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishedCourseOutcome_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublishedCourseOutcome_threshold_check"
    CHECK ("attainmentThreshold" >= 0 AND "attainmentThreshold" <= 100),
  CONSTRAINT "PublishedCourseOutcome_sortOrder_check" CHECK ("sortOrder" > 0)
);

CREATE TABLE "PublishedAssessmentComponent" (
  "id" TEXT NOT NULL,
  "schemeId" TEXT NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(300) NOT NULL,
  "type" "AssessmentComponentType" NOT NULL,
  "fullScore" DECIMAL(8,2) NOT NULL,
  "weight" DECIMAL(7,4) NOT NULL,
  "sourceType" "GradeSourceType" NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "sourceJson" JSONB NOT NULL,
  "rubricJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishedAssessmentComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublishedAssessmentComponent_fullScore_check" CHECK ("fullScore" > 0),
  CONSTRAINT "PublishedAssessmentComponent_weight_check"
    CHECK ("weight" >= 0 AND "weight" <= 100),
  CONSTRAINT "PublishedAssessmentComponent_sortOrder_check" CHECK ("sortOrder" > 0)
);

CREATE TABLE "PublishedAssessmentOutcomeMapping" (
  "id" TEXT NOT NULL,
  "schemeId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "outcomeId" TEXT NOT NULL,
  "allocationRate" DECIMAL(7,4) NOT NULL,
  "sourceJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishedAssessmentOutcomeMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublishedAssessmentOutcomeMapping_rate_check"
    CHECK ("allocationRate" >= 0 AND "allocationRate" <= 100)
);

CREATE UNIQUE INDEX "Course_currentPublishedAssessmentSchemeId_key"
  ON "Course"("currentPublishedAssessmentSchemeId");
CREATE UNIQUE INDEX "AssessmentSchemeDraft_courseId_key"
  ON "AssessmentSchemeDraft"("courseId");
CREATE INDEX "AssessmentSchemeDraft_sourcePublishedSyllabusStructureId_idx"
  ON "AssessmentSchemeDraft"("sourcePublishedSyllabusStructureId");
CREATE INDEX "AssessmentSchemeDraft_createdById_createdAt_idx"
  ON "AssessmentSchemeDraft"("createdById", "createdAt");
CREATE UNIQUE INDEX "AssessmentSchemeReviewRevision_draftId_revisionNumber_key"
  ON "AssessmentSchemeReviewRevision"("draftId", "revisionNumber");
CREATE INDEX "AssessmentSchemeReviewRevision_courseId_createdAt_idx"
  ON "AssessmentSchemeReviewRevision"("courseId", "createdAt");
CREATE INDEX "AssessmentSchemeReviewRevision_sourcePublishedSyllabusStruc_idx"
  ON "AssessmentSchemeReviewRevision"("sourcePublishedSyllabusStructureId");
CREATE INDEX "AssessmentSchemeReviewRevision_editedById_createdAt_idx"
  ON "AssessmentSchemeReviewRevision"("editedById", "createdAt");
CREATE UNIQUE INDEX "PublishedAssessmentScheme_reviewRevisionId_key"
  ON "PublishedAssessmentScheme"("reviewRevisionId");
CREATE UNIQUE INDEX "PublishedAssessmentScheme_courseId_versionNumber_key"
  ON "PublishedAssessmentScheme"("courseId", "versionNumber");
CREATE INDEX "PublishedAssessmentScheme_courseId_publishedAt_idx"
  ON "PublishedAssessmentScheme"("courseId", "publishedAt");
CREATE INDEX "PublishedAssessmentScheme_sourcePublishedSyllabusStructureI_idx"
  ON "PublishedAssessmentScheme"("sourcePublishedSyllabusStructureId");
CREATE INDEX "PublishedAssessmentScheme_publishedById_publishedAt_idx"
  ON "PublishedAssessmentScheme"("publishedById", "publishedAt");
CREATE UNIQUE INDEX "PublishedCourseOutcome_schemeId_code_key"
  ON "PublishedCourseOutcome"("schemeId", "code");
CREATE UNIQUE INDEX "PublishedCourseOutcome_schemeId_sortOrder_key"
  ON "PublishedCourseOutcome"("schemeId", "sortOrder");
CREATE INDEX "PublishedCourseOutcome_schemeId_sortOrder_idx"
  ON "PublishedCourseOutcome"("schemeId", "sortOrder");
CREATE UNIQUE INDEX "PublishedAssessmentComponent_schemeId_code_key"
  ON "PublishedAssessmentComponent"("schemeId", "code");
CREATE UNIQUE INDEX "PublishedAssessmentComponent_schemeId_sortOrder_key"
  ON "PublishedAssessmentComponent"("schemeId", "sortOrder");
CREATE INDEX "PublishedAssessmentComponent_schemeId_enabled_sortOrder_idx"
  ON "PublishedAssessmentComponent"("schemeId", "enabled", "sortOrder");
CREATE UNIQUE INDEX "PublishedAssessmentOutcomeMapping_componentId_outcomeId_key"
  ON "PublishedAssessmentOutcomeMapping"("componentId", "outcomeId");
CREATE INDEX "PublishedAssessmentOutcomeMapping_schemeId_componentId_idx"
  ON "PublishedAssessmentOutcomeMapping"("schemeId", "componentId");
CREATE INDEX "PublishedAssessmentOutcomeMapping_schemeId_outcomeId_idx"
  ON "PublishedAssessmentOutcomeMapping"("schemeId", "outcomeId");

ALTER TABLE "Course" ADD CONSTRAINT "Course_currentPublishedAssessmentSchemeId_fkey"
  FOREIGN KEY ("currentPublishedAssessmentSchemeId")
  REFERENCES "PublishedAssessmentScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchemeDraft" ADD CONSTRAINT "AssessmentSchemeDraft_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchemeDraft" ADD CONSTRAINT "AssessmentSchemeDraft_sourcePublishedSyllabusStructureId_fkey"
  FOREIGN KEY ("sourcePublishedSyllabusStructureId")
  REFERENCES "PublishedSyllabusStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchemeDraft" ADD CONSTRAINT "AssessmentSchemeDraft_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchemeReviewRevision" ADD CONSTRAINT "AssessmentSchemeReviewRevision_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "AssessmentSchemeDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchemeReviewRevision" ADD CONSTRAINT "AssessmentSchemeReviewRevision_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchemeReviewRevision" ADD CONSTRAINT "AssessmentSchemeReviewRevision_sourcePublishedSyllabusStru_fkey"
  FOREIGN KEY ("sourcePublishedSyllabusStructureId")
  REFERENCES "PublishedSyllabusStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentSchemeReviewRevision" ADD CONSTRAINT "AssessmentSchemeReviewRevision_editedById_fkey"
  FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedAssessmentScheme" ADD CONSTRAINT "PublishedAssessmentScheme_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedAssessmentScheme" ADD CONSTRAINT "PublishedAssessmentScheme_sourcePublishedSyllabusStructure_fkey"
  FOREIGN KEY ("sourcePublishedSyllabusStructureId")
  REFERENCES "PublishedSyllabusStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedAssessmentScheme" ADD CONSTRAINT "PublishedAssessmentScheme_reviewRevisionId_fkey"
  FOREIGN KEY ("reviewRevisionId")
  REFERENCES "AssessmentSchemeReviewRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedAssessmentScheme" ADD CONSTRAINT "PublishedAssessmentScheme_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedCourseOutcome" ADD CONSTRAINT "PublishedCourseOutcome_schemeId_fkey"
  FOREIGN KEY ("schemeId") REFERENCES "PublishedAssessmentScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedAssessmentComponent" ADD CONSTRAINT "PublishedAssessmentComponent_schemeId_fkey"
  FOREIGN KEY ("schemeId") REFERENCES "PublishedAssessmentScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedAssessmentOutcomeMapping" ADD CONSTRAINT "PublishedAssessmentOutcomeMapping_schemeId_fkey"
  FOREIGN KEY ("schemeId") REFERENCES "PublishedAssessmentScheme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedAssessmentOutcomeMapping" ADD CONSTRAINT "PublishedAssessmentOutcomeMapping_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "PublishedAssessmentComponent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedAssessmentOutcomeMapping" ADD CONSTRAINT "PublishedAssessmentOutcomeMapping_outcomeId_fkey"
  FOREIGN KEY ("outcomeId") REFERENCES "PublishedCourseOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
