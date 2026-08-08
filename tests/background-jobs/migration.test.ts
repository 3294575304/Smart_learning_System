import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const jobMigrationPath =
  "prisma/migrations/20260808120000_add_background_job_foundation/migration.sql";
const eventMigrationPath =
  "prisma/migrations/20260808123000_add_learning_events/migration.sql";

test("iteration five A migrations are additive and split by domain", async () => {
  const [jobSql, eventSql] = await Promise.all([
    readFile(jobMigrationPath, "utf8"),
    readFile(eventMigrationPath, "utf8"),
  ]);
  assert.match(jobSql, /CREATE TABLE "BackgroundJob"/);
  assert.match(jobSql, /CREATE TABLE "BackgroundJobAttempt"/);
  assert.doesNotMatch(jobSql, /LearningEvent/);
  assert.match(eventSql, /CREATE TABLE "LearningEvent"/);
  assert.match(eventSql, /CREATE TABLE "LearningEventConcept"/);
  assert.match(eventSql, /ADD COLUMN "learningEventId" TEXT/);
  assert.doesNotMatch(`${jobSql}\n${eventSql}`, /INSERT\s+INTO/i);
  assert.doesNotMatch(
    `${jobSql}\n${eventSql}`,
    /UPDATE\s+"(?:StudentAnswer|StudentAnswerConceptEvidence)"/i,
  );
});

test("iteration five A migrations enforce idempotency and immutable history", async () => {
  const sql = `${await readFile(jobMigrationPath, "utf8")}\n${await readFile(
    eventMigrationPath,
    "utf8",
  )}`;
  assert.match(sql, /BackgroundJob_type_idempotencyKey_key/);
  assert.match(sql, /BackgroundJobAttempt_jobId_attemptNumber_key/);
  assert.match(sql, /LearningEvent_sourceType_sourceId_sourceRevision_key/);
  assert.match(sql, /LearningEvent_eventType_idempotencyKey_key/);
  assert.match(sql, /LearningEventConcept_learningEventId_conceptId_key/);
  assert.match(sql, /ON DELETE RESTRICT/);
});
