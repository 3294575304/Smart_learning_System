import assert from "node:assert/strict";
import test from "node:test";

import {
  CourseSurveyDimension,
  CourseSurveyMode,
  CourseSurveyQuestionType,
} from "@prisma/client";

import {
  createCourseSurveySchema,
  submitCourseSurveySchema,
  updateCourseSurveySchema,
} from "@/services/course-surveys/schemas";

const classroomId = "cm0000000000000000000001";
const questionId = "cm0000000000000000000002";

test("问卷时间、模式与回答类型使用共享严格 Schema", () => {
  const created = createCourseSurveySchema.parse({
    classroomId,
    title: "Python 结课问卷",
    mode: CourseSurveyMode.ANONYMOUS,
    opensAt: "2026-08-16T08:00:00.000Z",
    dueAt: "2026-08-23T08:00:00.000Z",
  });
  assert.equal(created.mode, CourseSurveyMode.ANONYMOUS);
  assert.match(created.instructions, /不计入课程成绩/u);

  const submitted = submitCourseSurveySchema.parse({
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    answers: [{ questionId, kind: "SCALE", value: 5 }],
  });
  assert.equal(submitted.answers[0]?.kind, "SCALE");
});

test("课程目标自评题必须保留目标来源且开放题不得伪装成量表维度", () => {
  const common = {
    expectedVersion: 1,
    title: "Python 结课问卷",
    description: "",
    instructions: "不计入课程成绩",
    mode: CourseSurveyMode.ANONYMOUS,
    opensAt: new Date("2026-08-16T08:00:00.000Z"),
    dueAt: new Date("2026-08-23T08:00:00.000Z"),
  };
  assert.equal(
    updateCourseSurveySchema.safeParse({
      ...common,
      questions: [
        {
          type: CourseSurveyQuestionType.LIKERT_5,
          dimension: CourseSurveyDimension.OUTCOME_SELF_ASSESSMENT,
          prompt: "我已达到课程目标",
          required: true,
          sortOrder: 1,
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    updateCourseSurveySchema.safeParse({
      ...common,
      questions: [
        {
          type: CourseSurveyQuestionType.OPEN_TEXT,
          dimension: CourseSurveyDimension.CONTENT,
          prompt: "请提出建议",
          required: false,
          sortOrder: 1,
        },
      ],
    }).success,
    false,
  );
});
