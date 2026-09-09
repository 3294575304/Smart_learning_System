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
const allocationMatrix = {
  "1.1": {
    regular: 0.5,
    assignment: 0.6,
    midterm: 0.6,
    experiment: 0.5,
    final: 0.6,
  },
  "2.1": {
    regular: 0.25,
    assignment: 0.2,
    midterm: 0.3,
    experiment: 0.25,
    final: 0.3,
  },
  "3.1": {
    regular: 0.25,
    assignment: 0.2,
    midterm: 0.1,
    experiment: 0.25,
    final: 0.1,
  },
} as const;

function allocationsFor(code: keyof typeof allocationMatrix) {
  return components.map((component) => ({
    componentCode: component.code,
    allocationRate:
      allocationMatrix[code][
        component.code as keyof (typeof allocationMatrix)[typeof code]
      ],
  }));
}
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
      title: "知识目标",
      description:
        "掌握 Python 程序设计的基础知识、基本语法和常用数据结构，能够解释程序执行过程并完成基础计算任务。",
      threshold: 0.68,
      attainmentIndex: 0.78,
      participantCount: 24,
      componentAllocations: allocationsFor("1.1"),
      studentScores: Array.from(
        { length: 24 },
        (_, index) => 0.58 + ((index * 7) % 34) / 100,
      ),
    },
    {
      code: "2.1",
      title: "能力目标",
      description:
        "能够运用 Python 分析实际问题、设计求解步骤并实现程序，具备调试、验证和改进程序的基本能力。",
      threshold: 0.68,
      attainmentIndex: 0.77,
      participantCount: 24,
      componentAllocations: allocationsFor("2.1"),
      studentScores: Array.from(
        { length: 24 },
        (_, index) => 0.56 + ((index * 5) % 38) / 100,
      ),
    },
    {
      code: "3.1",
      title: "素养目标",
      description:
        "形成规范、严谨和可维护的程序设计意识，能够在协作与自主学习中遵守基本工程规范并持续改进。",
      threshold: 0.68,
      attainmentIndex: 0.81,
      participantCount: 24,
      componentAllocations: allocationsFor("3.1"),
      studentScores: Array.from(
        { length: 24 },
        (_, index) => 0.7 + ((index * 3) % 27) / 100,
      ),
    },
  ],
  attendance: { sessionCount: 8, presentRate: 0.94 },
  survey: {
    surveyId: "cm0000000000000000000010",
    title: "计算机程序设计（Python）III课程目标达成情况调查问卷",
    mode: "ANONYMOUS",
    summaryRevisionId: "cm0000000000000000000011",
    summaryRevisionNumber: 1,
    responseCount: 22,
    eligibleCount: 24,
    responseRate: 0.9167,
    minSampleSize: 5,
    isSuppressed: false,
    overallMean: 4.22,
    outcomes: [
      { code: "1.1", title: "知识目标", count: 22, mean: 4.15 },
      { code: "2.1", title: "能力目标", count: 22, mean: 4.1 },
      { code: "3.1", title: "素养目标", count: 22, mean: 4.3 },
    ],
    dimensions: [
      { code: "CONTENT", title: "教学内容", count: 22, mean: 4.2 },
      { code: "ASSESSMENT", title: "考核方式", count: 22, mean: 4.18 },
    ],
    themes: [
      { key: "PRACTICE", label: "增加综合实践", count: 8 },
      { key: "FEEDBACK", label: "加强即时反馈", count: 5 },
    ],
    themeNarrative: "开放题意见主要集中在增加综合实践、加强练习反馈与讲评。",
    ruleVersion: "course-survey-summary-v1",
  },
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
