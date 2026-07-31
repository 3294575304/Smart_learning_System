-- Preserve the existing syllabus row as version 1, then allow immutable versions.
ALTER TABLE "CourseSyllabus"
  ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "checksumSha256" CHAR(64);

DROP INDEX "CourseSyllabus_courseId_key";

CREATE UNIQUE INDEX "CourseSyllabus_courseId_versionNumber_key"
  ON "CourseSyllabus"("courseId", "versionNumber");

CREATE INDEX "CourseSyllabus_courseId_createdAt_idx"
  ON "CourseSyllabus"("courseId", "createdAt");

CREATE TYPE "SyllabusParseStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED'
);

CREATE TABLE "SyllabusParseDraft" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "syllabusId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" "SyllabusParseStatus" NOT NULL DEFAULT 'PENDING',
  "parserVersion" VARCHAR(50) NOT NULL,
  "promptVersion" VARCHAR(50) NOT NULL,
  "ruleVersion" VARCHAR(50) NOT NULL,
  "provider" VARCHAR(100),
  "model" VARCHAR(150),
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "executionCount" INTEGER NOT NULL DEFAULT 0,
  "structuredResult" JSONB,
  "extractedTextMetadata" JSONB,
  "errorCode" VARCHAR(100),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SyllabusParseDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyllabusParseDraft_syllabusId_parserVersion_key"
  ON "SyllabusParseDraft"("syllabusId", "parserVersion");

CREATE INDEX "SyllabusParseDraft_courseId_status_createdAt_idx"
  ON "SyllabusParseDraft"("courseId", "status", "createdAt");

CREATE INDEX "SyllabusParseDraft_requestedById_createdAt_idx"
  ON "SyllabusParseDraft"("requestedById", "createdAt");

ALTER TABLE "SyllabusParseDraft"
  ADD CONSTRAINT "SyllabusParseDraft_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SyllabusParseDraft"
  ADD CONSTRAINT "SyllabusParseDraft_syllabusId_fkey"
  FOREIGN KEY ("syllabusId") REFERENCES "CourseSyllabus"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SyllabusParseDraft"
  ADD CONSTRAINT "SyllabusParseDraft_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
