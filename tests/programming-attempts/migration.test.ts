import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../../prisma/migrations/20260809170000_add_programming_attempts/migration.sql",
  import.meta.url,
);

test("programming attempt migration is additive and preserves result history", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /CREATE TABLE "ProgrammingAttempt"/u);
  assert.match(sql, /CREATE TABLE "ProgrammingTestCaseResult"/u);
  assert.match(
    sql,
    /ProgrammingAttempt_studentAnswerId_kind_revisionNumber_key/u,
  );
  assert.match(sql, /ProgrammingTestCaseResult_testCaseId_fkey/u);
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/imu);
});
