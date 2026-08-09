import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../prisma/migrations/20260809150000_add_python_programming_question_config/migration.sql",
  import.meta.url,
);

test("Python 题型 migration 纯追加并冻结明确配置字段", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /ADD VALUE IF NOT EXISTS 'PYTHON_PROGRAMMING'/u);
  assert.match(sql, /CREATE TABLE "ProgrammingQuestionConfigRevision"/u);
  assert.match(sql, /CREATE TABLE "AssignmentProgrammingConfigSnapshot"/u);
  assert.match(sql, /"testCasesHash" CHAR\(64\) NOT NULL/u);
  assert.match(sql, /"executorRuleVersion" VARCHAR\(100\) NOT NULL/u);
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|TRUNCATE|UPDATE|INSERT)\b/imu);
});
