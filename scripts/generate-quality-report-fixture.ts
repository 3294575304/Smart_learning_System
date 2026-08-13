import { promises as fs } from "node:fs";
import path from "node:path";

import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";

import {
  buildDeterministicNarrative,
  calculateQualityReportStatistics,
} from "@/services/quality-reports/calculation";
import { buildQualityReportDocx } from "@/services/quality-reports/docx-writer";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";
import { buildQualityReportWorkbook } from "@/services/quality-reports/xlsx-writer";

const components = [
  { code: "regular", name: "平时表现", weight: 0.1 },
  { code: "assignment", name: "课程作业", weight: 0.05 },
  { code: "midterm", name: "期中考试", weight: 0.05 },
  { code: "experiment", name: "课程实验", weight: 0.2 },
  { code: "final", name: "期末考试", weight: 0.6 },
];
const students = Array.from({ length: 24 }, (_, index) => {
  const scores = {
    regular: 82 + (index % 5) * 3,
    assignment: 76 + (index % 6) * 4,
    midterm: 68 + (index % 7) * 4,
    experiment: 78 + (index % 5) * 4,
    final: 55 + (index % 9) * 5,
  };
  const totalScore = components.reduce(
    (sum, component) =>
      sum + scores[component.code as keyof typeof scores] * component.weight,
    0,
  );
  return {
    studentId: null,
    studentNo: `202500${String(index + 1).padStart(4, "0")}`,
    displayName: `示例学生${index + 1}`,
    status: GradeValueStatus.SCORED,
    componentScores: scores,
    totalScore: Number(totalScore.toFixed(2)),
  };
});
const source: QualityReportSourceSnapshot = {
  course: {
    id: "cm0000000000000000000000",
    name: "计算机程序设计（Python）III",
    courseNo: "PYTHON-III",
    term: "2025-2026-1学期",
    teacherName: "示例教师",
    courseNature: "专业(必)",
    credits: 4,
    majorClass: "大气科学类、2025级挂排班",
    college: "龙山书院、大气科学学院",
    major: "大气科学类",
  },
  classroom: { id: null, name: "2025级挂排班" },
  sourceType: QualityReportSourceType.PLATFORM,
  components,
  students,
  outcomes: [
    {
      code: "1.1",
      title: "掌握程序设计基础并解决计算问题",
      threshold: 0.68,
      attainmentIndex: 0.75,
      participantCount: 24,
    },
    {
      code: "2.1",
      title: "运用 Python 工具分析与实现问题",
      threshold: 0.68,
      attainmentIndex: 0.75,
      participantCount: 24,
    },
    {
      code: "3.1",
      title: "形成规范、可维护的程序设计能力",
      threshold: 0.68,
      attainmentIndex: 0.83,
      participantCount: 24,
    },
  ],
  attendance: { sessionCount: 8, presentRate: 0.94 },
  sourceReference: { fixture: true },
};
const statistics = calculateQualityReportStatistics(source);
const narrative = buildDeterministicNarrative(source, statistics);
async function main() {
  const output = path.resolve("tmp/iteration-seven-b/generated");
  await fs.mkdir(output, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(output, "quality-report-sample.docx"),
      await buildQualityReportDocx(source, statistics, narrative),
    ),
    fs.writeFile(
      path.join(output, "quality-report-grades-sample.xlsx"),
      buildQualityReportWorkbook(source),
    ),
  ]);
  console.log(output);
}

void main();
