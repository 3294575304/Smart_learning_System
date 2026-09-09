import assert from "node:assert/strict";
import test from "node:test";

import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";

import {
  buildDeterministicNarrative,
  calculateQualityReportStatistics,
} from "@/services/quality-reports/calculation";
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
  survey: null,
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

test("报告接入问卷聚合但明确与客观达成度分开呈现", () => {
  const withSurvey: QualityReportSourceSnapshot = {
    ...source,
    survey: {
      surveyId: "cm0000000000000000000002",
      title: "结课问卷",
      mode: "ANONYMOUS",
      summaryRevisionId: "cm0000000000000000000003",
      summaryRevisionNumber: 1,
      responseCount: 8,
      eligibleCount: 10,
      responseRate: 0.8,
      minSampleSize: 5,
      isSuppressed: false,
      overallMean: 4.25,
      outcomes: [{ code: "OBJ-1", title: "目标一", count: 8, mean: 4.1 }],
      dimensions: [],
      themes: [{ key: "PRACTICE", label: "实践与练习", count: 3 }],
      themeNarrative: "开放题主要涉及实践与练习。",
      ruleVersion: "course-survey-summary-v1",
    },
  };
  const narrative = buildDeterministicNarrative(
    withSurvey,
    calculateQualityReportStatistics(withSurvey),
  );
  assert.match(narrative.studentEvaluation, /8\/10/u);
  assert.match(narrative.studentEvaluation, /课程目标1 4\.10\/5/u);
  assert.match(narrative.studentEvaluation, /与客观达成度分开/u);
});

test("已识别课程目标但缺少达成度时不会误报为全部达标", () => {
  const withUncalculatedOutcome: QualityReportSourceSnapshot = {
    ...source,
    outcomes: [
      {
        code: "OBJ-1",
        title: "知识目标",
        description: "掌握 Python 基础语法。",
        threshold: null,
        attainmentIndex: null,
        participantCount: 0,
        componentAllocations: [],
        studentScores: [],
      },
    ],
  };
  const narrative = buildDeterministicNarrative(
    withUncalculatedOutcome,
    calculateQualityReportStatistics(withUncalculatedOutcome),
  );
  assert.match(narrative.outcomeAnalysis, /没有可核验/u);
  assert.doesNotMatch(narrative.outcomeAnalysis, /均达到/u);
});

test("按模板 A/B 口径计算目标统计并关联归一化学生自评", () => {
  const withOutcomeEvidence: QualityReportSourceSnapshot = {
    ...source,
    components: [
      { code: "regular", name: "平时表现", weight: 0.4 },
      { code: "final", name: "期末考试", weight: 0.6 },
    ],
    students: [
      {
        studentId: null,
        studentNo: "001",
        displayName: "甲",
        status: GradeValueStatus.SCORED,
        componentScores: { regular: 80, final: 70 },
        totalScore: 74,
      },
      {
        studentId: null,
        studentNo: "002",
        displayName: "乙",
        status: GradeValueStatus.SCORED,
        componentScores: { regular: 70, final: 60 },
        totalScore: 64,
      },
    ],
    outcomes: [
      {
        code: "1.1",
        title: "知识目标",
        description: "掌握基础知识。",
        threshold: 0.7,
        attainmentIndex: 0.71,
        participantCount: 2,
        componentAllocations: [
          { componentCode: "regular", allocationRate: 0.5 },
          { componentCode: "final", allocationRate: 0.25 },
        ],
        studentScores: [0.8, 60],
      },
    ],
    survey: {
      surveyId: "cm0000000000000000000002",
      title: "结课问卷",
      mode: "ANONYMOUS",
      summaryRevisionId: "cm0000000000000000000003",
      summaryRevisionNumber: 1,
      responseCount: 2,
      eligibleCount: 2,
      responseRate: 1,
      minSampleSize: 2,
      isSuppressed: false,
      overallMean: 4.5,
      outcomes: [{ code: " 1.1 ", title: "知识目标", count: 2, mean: 4.5 }],
      dimensions: [],
      themes: [],
      themeNarrative: "",
      ruleVersion: "course-survey-summary-v1",
    },
  };
  const result = calculateQualityReportStatistics(withOutcomeEvidence);
  const outcome = result.outcomes[0];
  assert.equal(outcome?.weightedAverage, 24.75);
  assert.equal(outcome?.weightedMaximum, 35);
  assert.equal(outcome?.computedAttainmentIndex, 0.7071);
  assert.equal(outcome?.aboveThresholdCount, 1);
  assert.equal(outcome?.aboveThresholdRate, 0.5);
  assert.equal(outcome?.aboveHighCount, 1);
  assert.equal(outcome?.median, 0.7);
  assert.equal(outcome?.minimum, 0.6);
  assert.equal(outcome?.maximum, 0.8);
  assert.equal(outcome?.surveyNormalized, 0.9);
});
