import assert from "node:assert/strict";
import test from "node:test";
import { OutcomeStudentStatus, Prisma } from "@prisma/client";
import {
  calculateClassOutcome,
  calculateStudentOutcome,
} from "@/services/outcome-attainment/calculation";
const d = (value: string | number) => new Prisma.Decimal(value);
const mappings = [
  { componentId: "a", componentWeight: d(40), allocationRate: d(50) },
  { componentId: "b", componentWeight: d(60), allocationRate: d(25) },
];
test("学生课程目标按考核权重与大纲分配比例加权", () => {
  const result = calculateStudentOutcome(
    [
      { componentId: "a", status: "COMPLETE", score: "80" },
      { componentId: "b", status: "COMPLETE", score: "60" },
    ],
    mappings,
    d(60),
  );
  assert.equal(result.status, OutcomeStudentStatus.INCLUDED);
  assert.equal(result.score?.toFixed(4), "71.4286");
  assert.equal(result.attained, true);
});
test("缺失证据排除，免修映射从分母剔除", () => {
  assert.equal(
    calculateStudentOutcome(
      [
        { componentId: "a", status: "INCOMPLETE", score: null },
        { componentId: "b", status: "COMPLETE", score: "80" },
      ],
      mappings,
      d(60),
    ).status,
    OutcomeStudentStatus.EXCLUDED_MISSING,
  );
  const exempt = calculateStudentOutcome(
    [
      { componentId: "a", status: "EXEMPT", score: null },
      { componentId: "b", status: "COMPLETE", score: "80" },
    ],
    mappings,
    d(60),
  );
  assert.equal(exempt.score?.toFixed(4), "80.0000");
});
test("班级均值、阈值和达成指数使用 Decimal", () => {
  const result = calculateClassOutcome([d("59.995"), d("60.005")], d(60));
  assert.equal(result.meanScore?.toFixed(4), "60.0000");
  assert.equal(result.attainmentIndex?.toFixed(4), "1.0000");
  assert.equal(result.attained, true);
});
