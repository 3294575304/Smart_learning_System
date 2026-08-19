import assert from "node:assert/strict";
import test from "node:test";

import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";

import {
  buildDeterministicNarrative,
  calculateQualityReportStatistics,
} from "@/services/quality-reports/calculation";
import { auditQualityReportDraft } from "@/services/quality-reports/quality-audit";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";

function source(): QualityReportSourceSnapshot {
  return {
    course: {
      id: "cm0000000000000000000000",
      name: "Python 程序设计",
      courseNo: "PY",
      term: "2026-2",
      teacherName: "教师",
      courseNature: "选修",
      credits: 0,
      majorClass: "计算机 2025 级 1 班",
      college: "",
      major: "",
    },
    classroom: { id: null, name: "计算机 2025 级 1 班" },
    sourceType: QualityReportSourceType.UPLOAD,
    components: [{ code: "final", name: "期末考试", weight: 1 }],
    students: [
      {
        studentId: null,
        studentNo: "001",
        displayName: "学生",
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
}

test("自动审查区分大纲、基础信息、目标达成和问卷缺口", () => {
  const input = source();
  const stats = calculateQualityReportStatistics(input);
  const baseline = buildDeterministicNarrative(input, stats);
  const audit = auditQualityReportDraft(input, stats, baseline, {
    fallbackUsed: true,
    errorCode: "AI_NARRATIVE_INVALID",
  });
  assert.equal(audit.status, "INCOMPLETE");
  const codes = new Set(audit.issues.map((item) => item.code));
  for (const code of [
    "SYLLABUS_NOT_PUBLISHED",
    "COURSE_CREDITS_MISSING",
    "COURSE_COLLEGE_MISSING",
    "COURSE_MAJOR_MISSING",
    "COURSE_OBJECTIVES_MISSING",
    "SURVEY_MISSING",
    "AI_NARRATIVE_FALLBACK",
  ])
    assert.ok(codes.has(code), code);
});

test("有正式目标但未计算达成度时给出补算提示而非目标缺失", () => {
  const input: QualityReportSourceSnapshot = {
    ...source(),
    course: {
      ...source().course,
      credits: 4,
      college: "计算机学院",
      major: "计算机相关专业",
    },
    syllabus: {
      publishedStructureId: "cm0000000000000000000002",
      versionNumber: 1,
      courseName: "Python 程序设计",
      courseCategory: "专业选修课",
      courseNature: "选修",
      credits: 4,
      teachingCollege: "计算机学院",
      applicableMajors: "计算机相关专业",
      objectiveCount: 1,
      assessmentCount: 1,
    },
    outcomes: [
      {
        code: "OBJ-1",
        title: "知识目标",
        description: "掌握 Python 基础语法。",
        threshold: 0.68,
        attainmentIndex: null,
        participantCount: 0,
        componentAllocations: [{ componentCode: "final", allocationRate: 1 }],
        studentScores: [],
      },
    ],
  };
  const stats = calculateQualityReportStatistics(input);
  const audit = auditQualityReportDraft(
    input,
    stats,
    buildDeterministicNarrative(input, stats),
  );
  const codes = new Set(audit.issues.map((item) => item.code));
  assert.ok(codes.has("OUTCOME_ATTAINMENT_MISSING"));
  assert.equal(codes.has("COURSE_OBJECTIVES_MISSING"), false);
});
