import assert from "node:assert/strict";
import test from "node:test";
import {
  missingPracticeAnswers,
  practiceDraftFilled,
} from "../../services/practice-sets/submission";
import { recommendationPracticeSubmitSchema } from "../../services/recommendations/schemas";

test("统一提交要求选择与判断必答，但完成题和空白文字题不阻塞", () => {
  assert.deepEqual(
    missingPracticeAnswers(
      [
        { id: "single", type: "SINGLE_CHOICE", status: "STARTED" },
        { id: "multi", type: "MULTIPLE_CHOICE", status: "PENDING" },
        { id: "bool", type: "TRUE_FALSE", status: "PENDING" },
        { id: "text", type: "SHORT_ANSWER", status: "PENDING" },
        { id: "done", type: "SINGLE_CHOICE", status: "COMPLETED" },
      ],
      {
        multi: { kind: "CHOICE", optionIds: ["option"] },
        bool: { kind: "BOOLEAN", value: false },
      },
    ),
    ["single"],
  );
  assert.equal(practiceDraftFilled({ kind: "BOOLEAN", value: false }), true);
  assert.equal(practiceDraftFilled({ kind: "TEXT", value: "  " }), false);
});

test("服务端允许空文字答案交给判分规则，仍拒绝空选择、重复选项和无效判断", () => {
  const input = (answer: unknown) => ({
    idempotencyKey: "5f84d2ef-4c28-4192-a996-f9efb0130380",
    answers: [answer],
  });
  assert.equal(
    recommendationPracticeSubmitSchema.safeParse(
      input({ questionId: "q", kind: "TEXT", value: "" }),
    ).success,
    true,
  );
  for (const answer of [
    { questionId: "q", kind: "CHOICE", optionIds: [] },
    { questionId: "q", kind: "CHOICE", optionIds: ["a", "a"] },
    { questionId: "q", kind: "BOOLEAN", value: null },
  ])
    assert.equal(
      recommendationPracticeSubmitSchema.safeParse(input(answer)).success,
      false,
    );
});
