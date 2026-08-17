import assert from "node:assert/strict";
import test from "node:test";

import { buildQualityReportWorkbook } from "@/services/quality-reports/xlsx-writer";
import { parseUploadedGradeWorkbook } from "@/services/quality-reports/upload-parser";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";
import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";

function fixture(): QualityReportSourceSnapshot {
  return {
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
    classroom: { id: null, name: "一班" },
    sourceType: QualityReportSourceType.UPLOAD,
    components: [
      { code: "regular", name: "平时表现", weight: 0.1 },
      { code: "assignment", name: "课程作业", weight: 0.05 },
      { code: "midterm", name: "期中考试", weight: 0.05 },
      { code: "experiment", name: "课程实验", weight: 0.2 },
      { code: "final", name: "期末考试", weight: 0.6 },
    ],
    students: [
      {
        studentId: null,
        studentNo: "001234567890123456",
        displayName: "学生",
        status: GradeValueStatus.SCORED,
        componentScores: {
          regular: 100,
          assignment: 90,
          midterm: 80,
          experiment: 70,
          final: 60,
        },
        totalScore: 68.5,
      },
    ],
    outcomes: [],
    attendance: { sessionCount: 0, presentRate: null },
    survey: null,
    sourceReference: {},
  };
}

test("生成的成绩计算工作簿保留文本学号、分项工作表和总评公式", () => {
  const workbook = buildQualityReportWorkbook(fixture());
  const parsed = parseUploadedGradeWorkbook("xlsx", workbook);
  assert.equal(parsed.students[0]?.studentNo, "001234567890123456");
  assert.equal(parsed.students[0]?.totalScore, 68.5);
  assert.equal(parsed.components.length, 5);
});
