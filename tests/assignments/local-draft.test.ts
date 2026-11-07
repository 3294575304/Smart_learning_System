import assert from "node:assert/strict";
import test from "node:test";
import { parseAssignmentLocalDraft } from "@/components/assignments/local-draft";
import type {
  AnswerableQuestion,
  QuestionAnswerState,
} from "@/components/assignments/question-answer-input";

const questions: AnswerableQuestion[] = [
  { id: "text", type: "SHORT_ANSWER", options: [] },
  {
    id: "choice",
    type: "MULTIPLE_CHOICE",
    options: [{ id: "a", label: "A", content: "选项", sortOrder: 1 }],
  },
];
const account: Record<string, QuestionAnswerState> = {
  text: { kind: "TEXT", value: "账号中的答案" },
  choice: { kind: "CHOICE", optionIds: [] },
};

test("旧本机草稿只恢复当前题目及选项，保留账号中未改动的答案", () => {
  const draft = parseAssignmentLocalDraft(
    JSON.stringify({
      answers: {
        choice: { kind: "CHOICE", optionIds: ["a", "other", "a"] },
        foreign: { kind: "TEXT", value: "另一题" },
      },
      responseTimes: { choice: 120, foreign: 500 },
    }),
    questions,
    account,
  );
  assert.deepEqual(draft, {
    answers: {
      text: account.text,
      choice: { kind: "CHOICE", optionIds: ["a"] },
    },
    responseTimes: { choice: 120 },
  });
  assert.equal(
    account.choice.kind === "CHOICE" && account.choice.optionIds.length,
    0,
  );
});

test("损坏或超限草稿不会破坏作答页，题型不匹配时保留账号答案", () => {
  for (const raw of [
    "broken",
    "null",
    JSON.stringify({ answers: { text: { kind: "TEXT", value: 5 } } }),
    JSON.stringify({ answers: {}, responseTimes: { text: 86_400_001 } }),
  ])
    assert.equal(parseAssignmentLocalDraft(raw, questions, account), null);
  assert.deepEqual(
    parseAssignmentLocalDraft(
      JSON.stringify({ answers: { text: { kind: "BOOLEAN", value: true } } }),
      questions,
      account,
    )?.answers,
    account,
  );
});

test("Python 草稿保留接口支持的完整 200000 字符代码", () => {
  const code = "x".repeat(200_000);
  const draft = parseAssignmentLocalDraft(
    JSON.stringify({ answers: { python: { kind: "CODE", value: code } } }),
    [{ id: "python", type: "PYTHON_PROGRAMMING", options: [] }],
    { python: { kind: "CODE", value: "" } },
  );
  assert.deepEqual(draft?.answers.python, { kind: "CODE", value: code });
});
