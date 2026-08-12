-- A teacher may return to a historical set of taught concepts. Revisions remain
-- append-only, while identical consecutive submissions are handled idempotently
-- by the service against the current revision.
DROP INDEX IF EXISTS "CourseTeachingProgressRevision_courseId_inputFingerprint_key";
CREATE INDEX IF NOT EXISTS "CourseTeachingProgressRevision_courseId_inputFingerprint_idx"
  ON "CourseTeachingProgressRevision"("courseId", "inputFingerprint");
