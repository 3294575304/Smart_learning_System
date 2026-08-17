import assert from "node:assert/strict";
import test from "node:test";

import {
  CourseSurveyDimension,
  CourseSurveyQuestionType,
} from "@prisma/client";

import {
  buildSurveySummary,
  redactSurveyComment,
} from "@/services/course-surveys/summary";

const scaleQuestion = {
  id: "scale",
  type: CourseSurveyQuestionType.LIKERT_5,
  dimension: CourseSurveyDimension.OUTCOME_SELF_ASSESSMENT,
  prompt: "我已达到课程目标 1",
  outcomeCode: "OBJ-1",
  outcomeTitle: "程序设计基础",
};
const openQuestion = {
  id: "open",
  type: CourseSurveyQuestionType.OPEN_TEXT,
  dimension: CourseSurveyDimension.OPEN_FEEDBACK,
  prompt: "改进建议",
  outcomeCode: null,
  outcomeTitle: null,
};

function responses(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `response-${index}`,
    submittedAt: new Date(`2026-08-16T08:0${index}:00.000Z`),
    answers: [
      { questionId: "scale", scaleValue: index === 0 ? 3 : 5, textValue: null },
      {
        questionId: "open",
        scaleValue: null,
        textValue: "希望增加实验练习和案例讲解",
      },
    ],
  }));
}

test("低于五份回答时只保留响应率并隐藏量表与开放题主题", () => {
  const summary = buildSurveySummary({
    surveyId: "survey",
    eligibleCount: 20,
    questions: [scaleQuestion, openQuestion],
    responses: responses(4),
  });
  assert.equal(summary.isSuppressed, true);
  assert.equal(summary.responseRate, 0.2);
  assert.deepEqual(summary.questions, []);
  assert.deepEqual(summary.themes, []);
});

test("达到阈值后确定性计算课程目标自评、分布和脱敏主题", () => {
  const summary = buildSurveySummary({
    surveyId: "survey",
    eligibleCount: 10,
    questions: [scaleQuestion, openQuestion],
    responses: responses(5),
  });
  assert.equal(summary.isSuppressed, false);
  assert.equal(summary.responseRate, 0.5);
  assert.equal(summary.overallMean, 4.6);
  assert.deepEqual(summary.questions[0]?.distribution, [0, 0, 1, 0, 4]);
  assert.equal(summary.outcomes[0]?.code, "OBJ-1");
  assert.equal(summary.themes[0]?.label, "实践与练习");
  assert.match(summary.themeNarrative, /不展示单份回答/u);
});

test("开放题脱敏邮箱、手机号、学号和显式姓名", () => {
  const redacted = redactSurveyComment(
    "姓名：张三，学号 202600001234，手机 13800138000，邮箱 test@example.com",
  );
  assert.doesNotMatch(
    redacted,
    /张三|202600001234|13800138000|test@example\.com/u,
  );
  assert.match(redacted, /已脱敏/u);
});
