import assert from "node:assert/strict";
import test from "node:test";
import { examAttemptAvailability } from "../../services/exams/attempt-policy";
import { examAttemptRulesSchema } from "../../services/exams/schemas";
import { examExitBody } from "../../components/exams/exam-exit";

test("旧考试默认一次，且保留退出续答", () => {
  assert.deepEqual(examAttemptRulesSchema.parse({}), {
    allowedAttempts: 1,
    autoSubmitOnExit: false,
  });
  for (const allowedAttempts of [0, 1.5, 21])
    assert.equal(
      examAttemptRulesSchema.safeParse({ allowedAttempts }).success,
      false,
    );
});

test("交卷扣一次，进行中和已撤回记录不扣减", () => {
  const availability = examAttemptAvailability(2, [
    { status: "WITHDRAWN" },
    { status: "GRADED" },
    { status: "IN_PROGRESS" },
  ]);
  assert.deepEqual(availability, { remainingAttempts: 1, hasInProgress: true });
  assert.equal(
    examAttemptAvailability(1, [{ status: "SUBMITTED" }]).remainingAttempts,
    0,
  );
});

test("关闭页面在浏览器发送限制内携带最新答案", () => {
  const payload = (value: string) => ({
    version: 0,
    answers: [
      { kind: "TEXT" as const, assignmentQuestionId: "question", value },
    ],
  });
  assert.deepEqual(JSON.parse(examExitBody("attempt", payload("答案"))), {
    submissionId: "attempt",
    trigger: "EXIT",
    answers: payload("答案"),
  });
  assert.deepEqual(
    JSON.parse(examExitBody("attempt", payload("题".repeat(25_000)))),
    {
      submissionId: "attempt",
      trigger: "EXIT",
    },
  );
});
