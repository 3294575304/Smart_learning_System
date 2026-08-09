import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../../prisma/migrations/20260809210000_add_ai_question_mapping_batches/migration.sql",
  import.meta.url,
);

test("mapping candidates stay separate from confirmed graph bindings", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /CREATE TABLE "AIQuestionMappingBatch"/u);
  assert.match(sql, /CREATE TABLE "AIQuestionMappingCandidate"/u);
  assert.doesNotMatch(sql, /INSERT INTO "QuestionKnowledgeGraphBinding"/u);
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/imu);
});
