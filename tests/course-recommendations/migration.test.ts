import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../../prisma/migrations/20260812100000_add_course_recommendation_foundation/migration.sql",
  import.meta.url,
);
const followUpMigration = new URL(
  "../../prisma/migrations/20260812110000_allow_repeated_teaching_progress_fingerprints/migration.sql",
  import.meta.url,
);

test("course recommendation migration is additive and keeps legacy recommendations", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /CREATE TABLE "CourseTeachingProgressRevision"/u);
  assert.match(sql, /CREATE TABLE "CourseRecommendationPolicyRevision"/u);
  assert.match(sql, /CREATE TABLE "CourseRecommendationCycle"/u);
  assert.match(sql, /studentId_courseId_inputFingerprint_key/u);
  assert.match(sql, /ADD COLUMN "courseCycleId" TEXT/u);
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/imu);
});

test("teaching progress may return to a historical concept set without rewriting revisions", async () => {
  const sql = await readFile(followUpMigration, "utf8");
  assert.match(
    sql,
    /DROP INDEX IF EXISTS "CourseTeachingProgressRevision_courseId_inputFingerprint_key"/u,
  );
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS "CourseTeachingProgressRevision_courseId_inputFingerprint_idx"/u,
  );
  assert.doesNotMatch(sql, /^\s*(?:DELETE|TRUNCATE|UPDATE|INSERT)\b/imu);
});
