import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("教学质量报告迁移保存双数据源、快照、任务和双产物元数据", async () => {
  const sql = await readFile(
    "prisma/migrations/20260813110000_add_course_quality_reports/migration.sql",
    "utf8",
  );
  for (const token of [
    "QualityReportSourceType",
    "sourceSnapshotJson",
    "statisticsSnapshotJson",
    "backgroundJobId",
    "docxStorageKey",
    "workbookStorageKey",
    "REPORT_GRADE_SOURCE",
  ])
    assert.ok(sql.includes(token), token);
});

test("教学质量报告审核迁移区分 AI 审核稿与人工确认正式版", async () => {
  const sql = await readFile(
    "prisma/migrations/20260817110000_add_quality_report_review/migration.sql",
    "utf8",
  );
  for (const token of [
    "QualityReportReviewStatus",
    "PENDING_REVIEW",
    "reviewedNarrativeJson",
    "reviewedById",
    "approvedDocxStorageKey",
    "QUALITY_REPORT_APPROVED",
  ])
    assert.ok(sql.includes(token), token);
});
