ALTER TYPE "AuditAction" ADD VALUE 'SYLLABUS_REVIEW_SAVED';
ALTER TYPE "AuditAction" ADD VALUE 'SYLLABUS_STRUCTURE_PUBLISHED';
ALTER TYPE "AuditTargetType" ADD VALUE 'SYLLABUS_REVIEW';
ALTER TYPE "AuditTargetType" ADD VALUE 'SYLLABUS_STRUCTURE';

ALTER TABLE "Course"
  ADD COLUMN "currentPublishedSyllabusStructureId" TEXT;

CREATE TABLE "SyllabusReviewRevision" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "syllabusId" TEXT NOT NULL,
  "parseDraftId" TEXT NOT NULL,
  "editedById" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "structureJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SyllabusReviewRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishedSyllabusStructure" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "syllabusId" TEXT NOT NULL,
  "parseDraftId" TEXT NOT NULL,
  "reviewRevisionId" TEXT NOT NULL,
  "publishedById" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "structureJson" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishedSyllabusStructure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Course_currentPublishedSyllabusStructureId_key"
  ON "Course"("currentPublishedSyllabusStructureId");
CREATE UNIQUE INDEX "SyllabusReviewRevision_parseDraftId_revisionNumber_key"
  ON "SyllabusReviewRevision"("parseDraftId", "revisionNumber");
CREATE INDEX "SyllabusReviewRevision_courseId_createdAt_idx"
  ON "SyllabusReviewRevision"("courseId", "createdAt");
CREATE INDEX "SyllabusReviewRevision_editedById_createdAt_idx"
  ON "SyllabusReviewRevision"("editedById", "createdAt");
CREATE UNIQUE INDEX "PublishedSyllabusStructure_reviewRevisionId_key"
  ON "PublishedSyllabusStructure"("reviewRevisionId");
CREATE UNIQUE INDEX "PublishedSyllabusStructure_courseId_versionNumber_key"
  ON "PublishedSyllabusStructure"("courseId", "versionNumber");
CREATE INDEX "PublishedSyllabusStructure_courseId_publishedAt_idx"
  ON "PublishedSyllabusStructure"("courseId", "publishedAt");
CREATE INDEX "PublishedSyllabusStructure_syllabusId_idx"
  ON "PublishedSyllabusStructure"("syllabusId");
CREATE INDEX "PublishedSyllabusStructure_publishedById_publishedAt_idx"
  ON "PublishedSyllabusStructure"("publishedById", "publishedAt");

ALTER TABLE "SyllabusReviewRevision" ADD CONSTRAINT "SyllabusReviewRevision_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SyllabusReviewRevision" ADD CONSTRAINT "SyllabusReviewRevision_syllabusId_fkey"
  FOREIGN KEY ("syllabusId") REFERENCES "CourseSyllabus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SyllabusReviewRevision" ADD CONSTRAINT "SyllabusReviewRevision_parseDraftId_fkey"
  FOREIGN KEY ("parseDraftId") REFERENCES "SyllabusParseDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SyllabusReviewRevision" ADD CONSTRAINT "SyllabusReviewRevision_editedById_fkey"
  FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PublishedSyllabusStructure" ADD CONSTRAINT "PublishedSyllabusStructure_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedSyllabusStructure" ADD CONSTRAINT "PublishedSyllabusStructure_syllabusId_fkey"
  FOREIGN KEY ("syllabusId") REFERENCES "CourseSyllabus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedSyllabusStructure" ADD CONSTRAINT "PublishedSyllabusStructure_parseDraftId_fkey"
  FOREIGN KEY ("parseDraftId") REFERENCES "SyllabusParseDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedSyllabusStructure" ADD CONSTRAINT "PublishedSyllabusStructure_reviewRevisionId_fkey"
  FOREIGN KEY ("reviewRevisionId") REFERENCES "SyllabusReviewRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedSyllabusStructure" ADD CONSTRAINT "PublishedSyllabusStructure_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_currentPublishedSyllabusStructureId_fkey"
  FOREIGN KEY ("currentPublishedSyllabusStructureId") REFERENCES "PublishedSyllabusStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
