import assert from "node:assert/strict";
import test from "node:test";

import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";

import type { AIProvider } from "@/services/ai/provider";
import {
  buildDeterministicNarrative,
  calculateQualityReportStatistics,
} from "@/services/quality-reports/calculation";
import { executeQualityReportNarrative } from "@/services/quality-reports/ai-execution";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";

const source: QualityReportSourceSnapshot = {
  course: {
    id: "cm0000000000000000000000",
    name: "Python",
    courseNo: "PY",
    term: "2026-1",
    teacherName: "不会发送给 AI",
    courseNature: "专业(必)",
    credits: 4,
    majorClass: "一班",
    college: "学院",
    major: "专业",
  },
  classroom: { id: null, name: "一班" },
  sourceType: QualityReportSourceType.PLATFORM,
  components: [{ code: "final", name: "期末考试", weight: 1 }],
  students: [
    {
      studentId: "cm0000000000000000000001",
      studentNo: "20260001",
      displayName: "不会发送给 AI",
      status: GradeValueStatus.SCORED,
      componentScores: { final: 80 },
      totalScore: 80,
    },
  ],
  outcomes: [],
  attendance: { sessionCount: 0, presentRate: null },
  survey: null,
  sourceReference: {},
};
const statistics = calculateQualityReportStatistics(source);
const baseline = buildDeterministicNarrative(source, statistics);

function provider(responder: (input: unknown) => unknown): AIProvider {
  return {
    name: "test-provider",
    model: "test-model",
    analyzeStudentPerformance: async () => ({}),
    parseSyllabus: async () => ({}),
    writeQualityReportNarrative: async (input) => responder(input),
  };
}

test("报告 AI 只接收去标识化聚合并接受严格结构文字", async () => {
  let serializedInput = "";
  const result = await executeQualityReportNarrative(
    provider((input) => {
      serializedInput = JSON.stringify(input);
      return {
        gradeAnalysis: "成绩分析",
        outcomeAnalysis: "目标分析",
        outcomeDetails: [],
        studentEvaluation: "学生评价",
        courseSummary: "课程总结",
        improvementMeasures: "持续改进",
      };
    }),
    source,
    statistics,
    baseline,
  );
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.output.improvementMeasures, "持续改进");
  assert.doesNotMatch(serializedInput, /20260001|不会发送给 AI/u);
});

test("报告 AI 连续两次输出无效时保留确定性基础报告", async () => {
  let attempts = 0;
  const result = await executeQualityReportNarrative(
    provider(() => {
      attempts += 1;
      return { invalid: true };
    }),
    source,
    statistics,
    baseline,
  );
  assert.equal(attempts, 2);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, "AI_NARRATIVE_INVALID");
  assert.deepEqual(result.output, baseline);
});
