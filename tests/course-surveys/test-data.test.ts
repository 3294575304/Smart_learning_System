import assert from "node:assert/strict";
import test from "node:test";
import { syntheticSurveyAnswers } from "../../scripts/survey-test-data";
import { testDataId } from "../../scripts/course-test-data";

const questions = [
  { id: testDataId("scale"), type: "LIKERT_5" as const },
  { id: testDataId("benefit"), type: "OPEN_TEXT" as const },
  { id: testDataId("suggestion"), type: "OPEN_TEXT" as const },
];

test("synthetic responses use the existing answer contract and cover every scale bucket", () => {
  for (const [draw, expected] of [
    [0, 1],
    [3, 2],
    [10, 3],
    [30, 4],
    [72, 5],
    [99, 5],
  ]) {
    const answers = syntheticSurveyAnswers(questions, (max) => draw % max);
    assert.equal(answers.length, questions.length);
    assert.deepEqual(answers[0], {
      questionId: questions[0].id,
      kind: "SCALE",
      value: expected,
    });
    for (const answer of answers.slice(1)) {
      assert.equal(answer.kind, "TEXT");
      assert.ok(String(answer.value).startsWith("【模拟意见】"));
    }
  }
});

test("96 anonymous samples have complete answers and contain no identity fields", () => {
  const responses = Array.from({ length: 96 }, () =>
    syntheticSurveyAnswers(questions),
  );
  assert.equal(responses.flat().length, 288);
  for (const answers of responses) {
    assert.equal(new Set(answers.map((answer) => answer.questionId)).size, 3);
    for (const answer of answers)
      assert.deepEqual(Object.keys(answer).sort(), [
        "kind",
        "questionId",
        "value",
      ]);
  }
});
