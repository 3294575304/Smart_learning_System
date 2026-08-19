import assert from "node:assert/strict";
import test from "node:test";
import { GradeSourceType } from "@prisma/client";

import {
  assessmentSchemeStructureSchema,
  publishableAssessmentSchemeSchema,
} from "@/services/assessment-schemes/schemas";
import { buildAssessmentSchemeFromSyllabus } from "@/services/assessment-schemes/source-extractor";
import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";

const syllabus: SyllabusParseOutput = {
  courseInfo: {
    courseName: "Python 程序设计",
    courseCode: "PY",
    description: null,
    credits: null,
    totalHours: 32,
    theoryHours: 20,
    practiceHours: 12,
    sourceRefs: [{ page: 2, verified: true }],
  },
  objectives: [
    {
      code: "O1",
      title: "知识",
      description: "知识目标",
      sourceRefs: [{ page: 3, verified: true }],
    },
    {
      code: "O2",
      title: "能力",
      description: "能力目标",
      sourceRefs: [{ page: 3, verified: true }],
    },
    {
      code: "O3",
      title: "素养",
      description: "素养目标",
      sourceRefs: [{ page: 3, verified: true }],
    },
  ],
  chapters: [],
  practiceItems: [],
  prerequisites: [],
  keyTopics: [],
  difficultTopics: [],
  assessments: [
    {
      code: "A1",
      name: "平时表现",
      type: "平时表现",
      weight: 10,
      description: null,
      sourceRefs: [{ page: 9, verified: true }],
    },
    {
      code: "A2",
      name: "课程作业",
      type: "课程作业",
      weight: 5,
      description: null,
      sourceRefs: [{ page: 9, verified: true }],
    },
    {
      code: "A3",
      name: "期中考试",
      type: "期中考试",
      weight: 5,
      description: null,
      sourceRefs: [{ page: 9, verified: true }],
    },
    {
      code: "A4",
      name: "课程实验",
      type: "课程实验",
      weight: 20,
      description: null,
      sourceRefs: [{ page: 9, verified: true }],
    },
    {
      code: "A5",
      name: "期末考试",
      type: "期末考试",
      weight: 60,
      description: null,
      sourceRefs: [{ page: 9, verified: true }],
    },
  ],
  objectiveAssessmentMappings: ["O1", "O2", "O3"].flatMap((objectiveCode) =>
    ["A1", "A2", "A3", "A4", "A5"].map((assessmentCode) => ({
      objectiveCode,
      assessmentCode,
      allocationRate: null,
      sourceRefs: [{ page: 8, verified: true }],
    })),
  ),
  materials: [],
  warnings: [],
};

const pages = [
  {
    pageNumber: 8,
    text: "课程目标在各考核方式中占比 平时表现 课程作业 期中考试 课程实验 期末考试 目标1 50% 60% 60% 50% 60% 目标2 25% 20% 30% 25% 30%",
  },
  {
    pageNumber: 9,
    text: "目标3 25% 20% 10% 25% 10% 合计 100% 100% 100% 100% 100% 各考核方式占总成绩权重 10% 5% 5% 20% 60% 考核方式评分标准 90-100（优）80-89（良）70-79（中）60-69（及格）0-59（不及格）",
  },
  {
    pageNumber: 10,
    text: "课程作业评价标准 90-100（优）80-89（良）70-79（中）60-69（及格）0-59（不及格）",
  },
];

test("从正式大纲原文确定性提取目标比例、百分制满分和达成阈值", () => {
  const result = buildAssessmentSchemeFromSyllabus(syllabus, pages);
  assert.equal(assessmentSchemeStructureSchema.safeParse(result).success, true);
  assert.deepEqual(
    result.components.map((component) => component.weight),
    [10, 5, 5, 20, 60],
  );
  assert.deepEqual(
    result.components[0]?.mappings.map((mapping) => mapping.allocationRate),
    [50, 25, 25],
  );
  assert.deepEqual(
    result.components[4]?.mappings.map((mapping) => mapping.allocationRate),
    [60, 30, 10],
  );
  assert.ok(
    result.outcomes.every((outcome) => outcome.attainmentThreshold === 60),
  );
  assert.ok(
    result.components.every((component) => component.fullScore === 100),
  );
  assert.equal(result.components[0]?.rubricBands.length, 5);
  assert.ok(
    result.components.every((component) => component.sourceType === null),
  );
});

test("正式大纲结构中的数值占比优先于 PDF 文本回退", () => {
  const structured = structuredClone(syllabus);
  const rates = [
    [50, 60, 60, 50, 60],
    [25, 20, 30, 25, 30],
    [25, 20, 10, 25, 10],
  ];
  structured.objectiveAssessmentMappings.forEach((mapping) => {
    const objectiveIndex = structured.objectives.findIndex(
      (objective) => objective.code === mapping.objectiveCode,
    );
    const assessmentIndex = structured.assessments.findIndex(
      (assessment) => assessment.code === mapping.assessmentCode,
    );
    mapping.allocationRate = rates[objectiveIndex]?.[assessmentIndex] ?? null;
  });

  const result = buildAssessmentSchemeFromSyllabus(structured, []);
  assert.deepEqual(
    result.components[0]?.mappings.map((mapping) => mapping.allocationRate),
    [50, 25, 25],
  );
  assert.deepEqual(
    result.components[4]?.mappings.map((mapping) => mapping.allocationRate),
    [60, 30, 10],
  );
});

test("发布校验区分来源待确认并验证权重与目标比例", () => {
  const draft = buildAssessmentSchemeFromSyllabus(syllabus, pages);
  assert.equal(
    publishableAssessmentSchemeSchema.safeParse(draft).success,
    false,
  );
  const confirmed = structuredClone(draft);
  confirmed.components.forEach((component) => {
    component.sourceType = GradeSourceType.MANUAL;
  });
  assert.equal(
    publishableAssessmentSchemeSchema.safeParse(confirmed).success,
    true,
  );
  confirmed.components[0]!.weight = 11;
  assert.equal(
    publishableAssessmentSchemeSchema.safeParse(confirmed).success,
    false,
  );
  confirmed.components[0]!.weight = 10;
  confirmed.components[0]!.mappings[0]!.allocationRate = 51;
  assert.equal(
    publishableAssessmentSchemeSchema.safeParse(confirmed).success,
    false,
  );
});

test("缺少原文表格时不编造比例、满分或达成阈值", () => {
  const result = buildAssessmentSchemeFromSyllabus(syllabus, []);
  assert.ok(
    result.outcomes.every((outcome) => outcome.attainmentThreshold === null),
  );
  assert.ok(
    result.components.every((component) => component.fullScore === null),
  );
  assert.ok(
    result.components.every((component) =>
      component.mappings.every((mapping) => mapping.allocationRate === null),
    ),
  );
  assert.ok(result.warnings.length >= 2);
});
