import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20261018100000_unify_question_bank/migration.sql",
  ),
  "utf8",
);

test("题库迁移按规范化课程名合并目录并回填开课", () => {
  assert.match(migration, /CREATE TABLE "QuestionCourseCategory"/u);
  assert.match(migration, /normalize\("name", NFKC\)/u);
  assert.match(migration, /GROUP BY normalized_name/u);
  assert.match(
    migration,
    /SET "questionCategoryId" = category\."id"[\s\S]*?Course_questionCategoryId_fkey/u,
  );
  assert.match(migration, /ALTER COLUMN "questionCategoryId" SET NOT NULL/u);
});

test("旧题优先沿用课程关联，仅从唯一知识图谱分类推断其余题目", () => {
  assert.match(migration, /question\."categoryCourseId" = course\."id"/u);
  assert.match(migration, /count\(DISTINCT course\."questionCategoryId"\)/u);
  assert.match(migration, /binding_categories\.category_count = 1/u);
  assert.match(migration, /question\."questionCategoryId" IS NULL/u);
});

test("迁移保留题目记录、旧回退字段和没有唯一分类来源的未分类题", () => {
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+"Question"/iu);
  assert.doesNotMatch(
    migration,
    /DROP\s+COLUMN\s+"(?:visibility|categoryCourseId)"/iu,
  );
  assert.match(
    migration,
    /ALTER TABLE "Question" ADD COLUMN "questionCategoryId" TEXT/u,
  );
  assert.doesNotMatch(
    migration,
    /ALTER TABLE "Question" ALTER COLUMN "questionCategoryId" SET NOT NULL/u,
  );
});
