import assert from "node:assert/strict";
import test from "node:test";
import {
  CourseGradeCalculationStatus,
  GradeValueStatus,
  Prisma,
} from "@prisma/client";

import {
  calculateCourseGrade,
  type GradeCalculationComponent,
} from "@/services/gradebook/calculation";

const d = (value: number | string) => new Prisma.Decimal(value);
function component(
  status: GradeValueStatus,
  score: number | null,
  weight = 100,
): GradeCalculationComponent {
  return {
    componentId: "c1",
    code: "A1",
    name: "期末考试",
    weight: d(weight),
    entries: [
      {
        revisionId: "r1",
        gradeItemId: "i1",
        itemName: "期末",
        itemWeight: d(1),
        maxScore: d(100),
        status,
        score: score === null ? null : d(score),
      },
    ],
  };
}

test("总评使用 Decimal、四位中间精度和两位四舍五入", () => {
  const result = calculateCourseGrade(
    [
      { ...component(GradeValueStatus.SCORED, 33.335, 40), componentId: "c1" },
      { ...component(GradeValueStatus.SCORED, 66.665, 60), componentId: "c2" },
    ],
    null,
  );
  assert.equal(result.status, CourseGradeCalculationStatus.COMPLETE);
  assert.equal(result.calculatedScore?.toFixed(2), "53.33");
});

test("0 分与缺失、缺考、缓考、请假、免修分别处理", () => {
  assert.equal(
    calculateCourseGrade(
      [component(GradeValueStatus.SCORED, 0)],
      null,
    ).calculatedScore?.toFixed(2),
    "0.00",
  );
  assert.equal(
    calculateCourseGrade(
      [component(GradeValueStatus.ABSENT, null)],
      null,
    ).calculatedScore?.toFixed(2),
    "0.00",
  );
  assert.equal(
    calculateCourseGrade(
      [component(GradeValueStatus.CHEATING, null)],
      null,
    ).calculatedScore?.toFixed(2),
    "0.00",
  );
  for (const status of [
    GradeValueStatus.NOT_ENTERED,
    GradeValueStatus.DEFERRED,
    GradeValueStatus.LEAVE,
    GradeValueStatus.OTHER,
  ]) {
    assert.equal(
      calculateCourseGrade([component(status, null)], null).status,
      CourseGradeCalculationStatus.INCOMPLETE,
    );
  }
  assert.equal(
    calculateCourseGrade([component(GradeValueStatus.EXEMPT, null)], null)
      .status,
    CourseGradeCalculationStatus.EXEMPT,
  );
});

test("免修项目从分母剔除，其余权重重新归一", () => {
  const result = calculateCourseGrade(
    [
      { ...component(GradeValueStatus.EXEMPT, null, 40), componentId: "c1" },
      { ...component(GradeValueStatus.SCORED, 80, 60), componentId: "c2" },
    ],
    null,
  );
  assert.equal(result.status, CourseGradeCalculationStatus.COMPLETE);
  assert.equal(result.calculatedScore?.toFixed(2), "80.00");
});

test("正式模板总评覆盖不改写组件计算证据", () => {
  const result = calculateCourseGrade(
    [component(GradeValueStatus.SCORED, 80)],
    { revisionId: "o1", status: GradeValueStatus.SCORED, score: d(72) },
  );
  assert.equal(result.calculatedScore?.toFixed(2), "80.00");
  assert.equal(result.effectiveScore?.toFixed(2), "72.00");
  assert.equal(result.componentResults[0]?.score, "80.0000");
});
