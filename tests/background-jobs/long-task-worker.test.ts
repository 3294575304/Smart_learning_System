import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { readLongTaskWorkerConfig } from "@/services/background-worker/config";
import {
  knowledgeGraphJobInputSchema,
  qualityReportJobInputSchema,
  questionMappingJobInputSchema,
  syllabusParseJobInputSchema,
} from "@/services/background-worker/contracts";

const root = process.cwd();

test("persistent worker validates every long-task payload", () => {
  const id = "cm12345678901234567890123";
  const context = { ipAddress: null, userAgent: "test" };
  assert.equal(
    qualityReportJobInputSchema.safeParse({ reportId: id, context }).success,
    true,
  );
  assert.equal(
    knowledgeGraphJobInputSchema.safeParse({
      teacherId: id,
      courseId: id,
      draftId: id,
      context,
    }).success,
    true,
  );
  assert.equal(
    syllabusParseJobInputSchema.safeParse({
      teacherId: id,
      courseId: id,
      draftId: id,
    }).success,
    true,
  );
  assert.equal(
    questionMappingJobInputSchema.safeParse({
      teacherId: id,
      courseId: id,
      batchId: id,
      questionIds: [id],
      context,
    }).success,
    true,
  );
  assert.equal(
    questionMappingJobInputSchema.safeParse({
      teacherId: id,
      courseId: id,
      batchId: id,
      questionIds: [],
      context,
    }).success,
    false,
  );
});

test("persistent worker configuration is bounded and requires a secret", () => {
  const config = readLongTaskWorkerConfig({
    BACKGROUND_JOB_WORKER_SECRET: "x".repeat(32),
  });
  assert.equal(config.pollIntervalMs, 2_000);
  assert.equal(config.leaseDurationMs, 120_000);
  assert.equal(config.wakePort, 18_789);
  assert.throws(() => readLongTaskWorkerConfig({}), /at least 32/u);
  assert.throws(
    () =>
      readLongTaskWorkerConfig({
        BACKGROUND_JOB_WORKER_SECRET: "x".repeat(32),
        BACKGROUND_LONG_TASK_WORKER_LEASE_DURATION_MS: "999999",
      }),
    /numeric configuration/u,
  );
});

test("Web routes only enqueue and wake persistent long tasks", async () => {
  const routes = await Promise.all(
    [
      "app/api/teacher/courses/[courseId]/quality-reports/route.ts",
      "app/api/teacher/courses/[courseId]/knowledge-graph/route.ts",
      "app/api/teacher/courses/[courseId]/syllabus/parse/route.ts",
      "app/api/teacher/courses/[courseId]/question-mapping-batches/route.ts",
    ].map((file) => readFile(path.join(root, file), "utf8")),
  );
  for (const source of routes) {
    assert.match(source, /scheduleBackgroundWorkerWakeup/u);
    assert.doesNotMatch(source, /after\s*\(/u);
    assert.doesNotMatch(source, /processQualityReportJob\s*\(/u);
    assert.doesNotMatch(source, /generateTeacherKnowledgeGraph\s*\(/u);
    assert.doesNotMatch(source, /createTeacherSyllabusParse\s*\(/u);
    assert.doesNotMatch(source, /createQuestionMappingBatch\s*\(/u);
  }
});

test("long-task migration links all business records to BackgroundJob", async () => {
  const sql = await readFile(
    path.join(
      root,
      "prisma/migrations/20260831120000_add_persistent_long_task_worker/migration.sql",
    ),
    "utf8",
  );
  for (const table of [
    "SyllabusParseDraft",
    "KnowledgeGraphDraft",
    "AIQuestionMappingBatch",
  ]) {
    assert.match(sql, new RegExp(`${table}_backgroundJobId_fkey`, "u"));
    assert.match(sql, new RegExp(`${table}_backgroundJobId_key`, "u"));
  }
});
