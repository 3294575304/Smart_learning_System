import assert from "node:assert/strict";
import test from "node:test";

import { GradeValueStatus } from "@prisma/client";

import {
  calculateUploadedOutcomeAttainment,
  matchFormalComponentsToReportComponents,
  remapOutcomeAllocations,
} from "@/services/quality-reports/outcome-calculation";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";

const components: QualityReportSourceSnapshot["components"] = [
  { code: "regular", name: "平时表现", weight: 0.4 },
  { code: "final", name: "期末考试", weight: 0.6 },
];

test("上传成绩组件按名称与正式考核方案代码建立一一映射", () => {
  const mapping = matchFormalComponentsToReportComponents(components, [
    { code: "ASSESS-1", name: "平时表现", weight: 0.4, sortOrder: 1 },
    { code: "ASSESS-2", name: "期末考试", weight: 0.6, sortOrder: 2 },
  ]);
  assert.ok(mapping);
  assert.equal(mapping.get("ASSESS-1"), "regular");
  assert.equal(mapping.get("ASSESS-2"), "final");
  const outcomes = remapOutcomeAllocations(
    [
      {
        code: "OBJ-1",
        title: "目标一",
        threshold: 0.6,
        attainmentIndex: null,
        participantCount: 0,
        componentAllocations: [
          { componentCode: "ASSESS-1", allocationRate: 1 },
          { componentCode: "ASSESS-2", allocationRate: 1 },
        ],
        studentScores: [],
      },
    ],
    mapping,
  );
  assert.deepEqual(
    outcomes[0]?.componentAllocations?.map((item) => item.componentCode),
    ["regular", "final"],
  );
});

test("上传成绩按正式目标占比确定性计算达成度并排除特殊状态", () => {
  const students: QualityReportSourceSnapshot["students"] = [
    {
      studentId: null,
      studentNo: "001",
      displayName: "甲",
      status: GradeValueStatus.SCORED,
      componentScores: { regular: 40, final: 80 },
      totalScore: 64,
    },
    {
      studentId: null,
      studentNo: "002",
      displayName: "乙",
      status: GradeValueStatus.SCORED,
      componentScores: { regular: 60, final: 100 },
      totalScore: 84,
    },
    {
      studentId: null,
      studentNo: "003",
      displayName: "丙",
      status: GradeValueStatus.ABSENT,
      componentScores: { regular: 100, final: 100 },
      totalScore: null,
    },
  ];
  const [outcome] = calculateUploadedOutcomeAttainment(components, students, [
    {
      code: "OBJ-1",
      title: "目标一",
      threshold: 0.6,
      attainmentIndex: null,
      participantCount: 0,
      componentAllocations: [
        { componentCode: "regular", allocationRate: 1 },
        { componentCode: "final", allocationRate: 1 },
      ],
      studentScores: [],
    },
  ]);
  assert.equal(outcome?.participantCount, 2);
  assert.deepEqual(outcome?.studentScores, [64, 84]);
  assert.equal(outcome?.attainmentIndex, 0.74);
});

test("目标占比无法覆盖上传成绩列时不猜测达成度", () => {
  const [outcome] = calculateUploadedOutcomeAttainment(
    components,
    [],
    [
      {
        code: "OBJ-1",
        title: "目标一",
        threshold: 0.6,
        attainmentIndex: null,
        participantCount: 0,
        componentAllocations: [
          { componentCode: "ASSESS-1", allocationRate: 1 },
        ],
        studentScores: [],
      },
    ],
  );
  assert.equal(outcome?.attainmentIndex, null);
  assert.equal(outcome?.participantCount, 0);
});

test("正式考核权重与上传模板不一致时拒绝按名称猜测对齐", () => {
  const mapping = matchFormalComponentsToReportComponents(components, [
    { code: "ASSESS-1", name: "平时表现", weight: 0.5, sortOrder: 1 },
    { code: "ASSESS-2", name: "期末考试", weight: 0.5, sortOrder: 2 },
  ]);
  assert.equal(mapping, null);
});
