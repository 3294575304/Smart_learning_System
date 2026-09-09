import assert from "node:assert/strict";
import test from "node:test";

import { normalizeQualityReportNarrative } from "@/services/quality-reports/presentation";

test("正文目标编号按冻结顺序展示，保留关联 code 和数值且兼容教师旧稿", () => {
  const text = "OBJ-10达成度0.80，课程目标 OBJ-1 为0.75；目标OBJ－2、obj–2。";
  const narrative = {
    gradeAnalysis: text,
    outcomeAnalysis: text,
    outcomeDetails: [{ code: "OBJ-10", analysis: text }],
    studentEvaluation: text,
    courseSummary: text,
    improvementMeasures: text,
  };
  const result = normalizeQualityReportNarrative(narrative, [
    { code: "OBJ-10" },
    { code: "OBJ-1" },
    { code: "OBJ-2" },
  ]);
  const expected =
    "课程目标1达成度0.80，课程目标2 为0.75；课程目标3、课程目标3。";
  for (const [key, value] of Object.entries(result)) {
    if (key !== "outcomeDetails") assert.equal(value, expected);
  }
  assert.equal(result.outcomeDetails[0]?.code, "OBJ-10");
  assert.equal(result.outcomeDetails[0]?.analysis, expected);
  assert.equal(narrative.outcomeDetails[0]?.analysis, text);
  assert.deepEqual(
    normalizeQualityReportNarrative(result, [{ code: "OBJ-10" }]),
    result,
  );
});
