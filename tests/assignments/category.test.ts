import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentCategorySchema,
  assignmentSyncIssue,
} from "@/services/assignments/category";
import { calculateCourseGrade } from "@/services/gradebook/calculation";
import { Prisma } from "@prisma/client";
test("三类作业仅进入对应且明确确认的正式项目", () => {
  for (const [category, type] of [
    ["PRACTICE", "REGULAR_PERFORMANCE"],
    ["COURSE_ASSIGNMENT", "COURSE_ASSIGNMENT"],
    ["COURSE_EXPERIMENT", "COURSE_EXPERIMENT"],
  ]) {
    const parsed = assignmentCategorySchema.parse(category);
    const component = {
      type,
      enabled: true,
      sourceType: "PLATFORM_ASSIGNMENT",
      assignmentAggregationConfirmed: true,
    };
    assert.equal(assignmentSyncIssue(parsed, component), null);
    assert.ok(
      assignmentSyncIssue(parsed, {
        ...component,
        assignmentAggregationConfirmed: false,
      }),
    );
    assert.ok(
      assignmentSyncIssue(parsed, { ...component, sourceType: "ATTENDANCE" }),
    );
    assert.ok(
      assignmentSyncIssue(parsed, { ...component, type: "FINAL_EXAM" }),
    );
  }
  assert.equal(assignmentCategorySchema.safeParse("EXAM").success, false);
});
test("非百分制作业先换算再等权，保留正式项目占比", () => {
  const d = (n: number) => new Prisma.Decimal(n);
  const result = calculateCourseGrade(
    [
      {
        componentId: "practice",
        code: "P",
        name: "练习",
        weight: d(20),
        entries: [
          {
            revisionId: "a",
            gradeItemId: "a",
            itemName: "20分作业",
            itemWeight: d(1),
            maxScore: d(20),
            status: "SCORED",
            score: d(10),
          },
          {
            revisionId: "b",
            gradeItemId: "b",
            itemName: "100分作业",
            itemWeight: d(1),
            maxScore: d(100),
            status: "SCORED",
            score: d(100),
          },
        ],
      },
      {
        componentId: "exam",
        code: "E",
        name: "考试",
        weight: d(80),
        entries: [
          {
            revisionId: "c",
            gradeItemId: "c",
            itemName: "期末",
            itemWeight: d(1),
            maxScore: d(100),
            status: "SCORED",
            score: d(60),
          },
        ],
      },
    ],
    null,
  );
  assert.equal(result.componentResults[0].score, "75.0000");
  assert.equal(result.calculatedScore?.toNumber(), 63);
});
