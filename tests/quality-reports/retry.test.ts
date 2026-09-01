import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("相同输入在失败或待重试状态下可重新排队且不创建重复报告版本", async () => {
  const source = await readFile("services/quality-reports/service.ts", "utf8");
  assert.match(source, /QualityReportStatus\.FAILED/u);
  assert.match(source, /retry:\$\{existing\.backgroundJob!\.id\}/u);
  assert.match(source, /backgroundJobId: job\.id/u);
  assert.doesNotMatch(source, /attemptCount: 0/u);
  assert.match(source, /reused: true, shouldExecute: true/u);
});
