import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../../prisma/migrations/20260809190000_add_learner_profile_snapshots/migration.sql",
  import.meta.url,
);

test("learner profile migration is immutable and idempotency constrained", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /CREATE TABLE "LearnerProfileSnapshot"/u);
  assert.match(sql, /eventWatermarkId/u);
  assert.match(sql, /calculationRuleVersion/u);
  assert.match(sql, /studentId_courseId_inputFingerprint_key/u);
  assert.match(sql, /LearnerProfileEvidenceState/u);
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/imu);
});
