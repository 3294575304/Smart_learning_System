import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "prisma/migrations/20260806190000_add_versioned_student_concept_mastery/migration.sql";

test("concept mastery migration is additive and does not backfill history", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /CREATE TABLE "AssignmentQuestionConceptSnapshot"/);
  assert.match(sql, /CREATE TABLE "StudentAnswerConceptEvidence"/);
  assert.match(sql, /CREATE TABLE "StudentCourseConceptMasteryRevision"/);
  assert.match(sql, /CREATE TABLE "StudentCourseConceptMasteryEntry"/);
  assert.doesNotMatch(sql, /INSERT\s+INTO/i);
  assert.doesNotMatch(sql, /UPDATE\s+"(?:Assignment|StudentAnswer)"/i);
});

test("concept mastery migration enforces immutable revision uniqueness", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(
    sql,
    /StudentAnswerConceptEvidence_studentAnswerId_conceptId_revision_key/,
  );
  assert.match(
    sql,
    /StudentCourseConceptMasteryRevision_stateId_inputFingerprint_key/,
  );
  assert.match(
    sql,
    /StudentCourseConceptMasteryEntry_masteryRevisionId_conceptId_key/,
  );
  assert.match(sql, /ON DELETE RESTRICT/);
});
