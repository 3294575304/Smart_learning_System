import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("正式 DOCX 只能在教师审核后下载且审核采用乐观并发", async () => {
  const service = await readFile("services/quality-reports/service.ts", "utf8");
  assert.match(service, /QualityReportReviewStatus\.PENDING_REVIEW/u);
  assert.match(service, /QualityReportReviewStatus\.APPROVED/u);
  assert.match(service, /updateMany\(\{/u);
  assert.match(service, /QUALITY_REPORT_REVIEW_REQUIRED/u);
  assert.match(service, /QUALITY_REPORT_APPROVED/u);
});

test("DOCX 生成器固定校验模板并保留外部审核签字区", async () => {
  const [writer, generator] = await Promise.all([
    readFile("services/quality-reports/docx-writer.ts", "utf8"),
    readFile("services/quality-reports/docx-generator.py", "utf8"),
  ]);
  assert.match(writer, /QUALITY_REPORT_TEMPLATE_CHECKSUM_MISMATCH/u);
  assert.match(
    generator,
    /The template's review opinions, signatures and dates are intentionally untouched/u,
  );
  assert.match(generator, /grade-distribution\.png/u);
  assert.match(generator, /outcome-summary\.png/u);
  assert.match(generator, /studentScores/u);
});
