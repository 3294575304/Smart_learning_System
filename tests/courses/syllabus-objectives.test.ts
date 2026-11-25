import assert from "node:assert/strict";
import test from "node:test";

import {
  publishableSyllabusStructureSchema,
  type SyllabusParseOutput,
} from "@/services/syllabus-parsing/schemas";

function syllabus(): SyllabusParseOutput {
  return {
    courseInfo: {
      courseName: "Python",
      courseCode: "PY",
      description: null,
      credits: null,
      totalHours: 32,
      theoryHours: 20,
      practiceHours: 12,
      sourceRefs: [],
    },
    objectives: [
      {
        code: "O1",
        title: "目标一",
        description: "目标一描述",
        overallAllocationRate: 60,
        sourceRefs: [],
      },
      {
        code: "O2",
        title: "目标二",
        description: "目标二描述",
        overallAllocationRate: 40,
        sourceObjectiveCode: null,
        sourceRefs: [],
      },
    ],
    chapters: [
      {
        code: "C1",
        title: "章节",
        description: null,
        suggestedHours: 2,
        order: 1,
        sourceRefs: [],
        knowledgePoints: [
          {
            code: "K1",
            name: "知识点",
            description: null,
            importance: "CORE",
            sourceRefs: [],
          },
        ],
      },
    ],
    practiceItems: [],
    prerequisites: [],
    keyTopics: [],
    difficultTopics: [],
    assessments: [
      {
        code: "A1",
        name: "考试",
        type: "EXAM",
        weight: 100,
        description: null,
        sourceRefs: [],
      },
    ],
    objectiveAssessmentMappings: [
      {
        objectiveCode: "O1",
        assessmentCode: "A1",
        allocationRate: 70,
        sourceRefs: [],
      },
      {
        objectiveCode: "O2",
        assessmentCode: "A1",
        allocationRate: 30,
        sourceRefs: [],
      },
    ],
    materials: [],
    warnings: [],
  };
}

test("教师总体比例可独立于考核映射，缺项和总和错误不能发布", () => {
  const value = syllabus();
  assert.equal(
    publishableSyllabusStructureSchema.safeParse(value).success,
    true,
  );
  value.objectives[1]!.overallAllocationRate = null;
  assert.equal(
    publishableSyllabusStructureSchema.safeParse(value).success,
    false,
  );
  value.objectives[1]!.overallAllocationRate = 30;
  assert.equal(
    publishableSyllabusStructureSchema.safeParse(value).success,
    false,
  );
  value.objectives.forEach((item) => {
    delete item.overallAllocationRate;
  });
  assert.equal(
    publishableSyllabusStructureSchema.safeParse(value).success,
    true,
  );
});

test("增删目标时映射和正向分解分值列必须完整对应", () => {
  const value = syllabus();
  value.objectives.splice(0, 1);
  assert.equal(
    publishableSyllabusStructureSchema.safeParse(value).success,
    false,
  );
  value.objectives[0]!.overallAllocationRate = 100;
  value.objectiveAssessmentMappings = [
    {
      objectiveCode: "O2",
      assessmentCode: "A1",
      allocationRate: 100,
      sourceRefs: [],
    },
  ];
  assert.equal(
    publishableSyllabusStructureSchema.safeParse(value).success,
    true,
  );

  value.assessmentMethod = "FORWARD_DECOMPOSITION";
  value.forwardAssessmentTable = {
    method: "FORWARD_DECOMPOSITION",
    sourceRefs: [],
    tableNumber: 1,
    items: [
      {
        code: "A1",
        name: "考试",
        group: "考试",
        points: 100,
        objectivePoints: [100],
        sourceColumn: 1,
      },
    ],
    objectiveTotals: [100],
    totalPoints: 100,
    warnings: [],
  };
  assert.equal(
    publishableSyllabusStructureSchema.safeParse(value).success,
    true,
  );
  value.forwardAssessmentTable.items[0]!.objectivePoints.push(0);
  assert.equal(
    publishableSyllabusStructureSchema.safeParse(value).success,
    false,
  );
});
