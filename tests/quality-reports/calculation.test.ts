import assert from "node:assert/strict";
import test from "node:test";

import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";

import { calculateQualityReportStatistics } from "@/services/quality-reports/calculation";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";

const source: QualityReportSourceSnapshot = {
  course: {
    id: "cm0000000000000000000000",
    name: "Python",
    courseNo: "PY",
    term: "2025-1",
    teacherName: "教师",
    courseNature: "专业(必)",
    credits: 4,
    majorClass: "一班",
    college: "学院",
    major: "专业",
  },
  classroom: { id: "cm0000000000000000000001", name: "一班" },
  sourceType: QualityReportSourceType.UPLOAD,
  components: [{ code: "final", name: "期末考试", weight: 1 }],
  students: [
    {
      studentId: null,
      studentNo: "001",
      displayName: "甲",
      status: GradeValueStatus.SCORED,
      componentScores: { final: 95 },
      totalScore: 95,
    },
    {
      studentId: null,
      studentNo: "002",
      displayName: "乙",
      status: GradeValueStatus.SCORED,
      componentScores: { final: 55 },
      totalScore: 55,
    },
    {
      studentId: null,
      studentNo: "003",
      displayName: "丙",
      status: GradeValueStatus.EXEMPT,
      componentScores: { final: null },
      totalScore: null,
    },
  ],
  outcomes: [],
  attendance: { sessionCount: 0, presentRate: null },
  sourceReference: {},
};

test("特殊状态与缺失成绩不进入成绩分布分母", () => {
  const result = calculateQualityReportStatistics(source);
  assert.equal(result.participantCount, 2);
  assert.equal(result.excludedCount, 1);
  assert.equal(result.mean, 75);
  assert.equal(result.passRate, 0.5);
  assert.deepEqual(
    result.distribution.map((item) => item.count),
    [1, 0, 0, 0, 1],
  );
});
