import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeSubmission,
  type SummaryAnswer,
  type SummaryQuestion,
} from "../../services/assignments/submission-summary";
const questions: SummaryQuestion[] = [
  { id: "a", type: "SINGLE_CHOICE", points: 2 },
  { id: "b", type: "PYTHON_PROGRAMMING", points: 10 },
  { id: "c", type: "SHORT_ANSWER", points: 50 },
];
const answers: SummaryAnswer[] = [
  {
    questionId: "a",
    score: 2,
    isCorrect: true,
    gradingStatus: "AUTO_GRADED",
    judgeStatus: null,
  },
  {
    questionId: "b",
    score: 5,
    isCorrect: false,
    gradingStatus: "AUTO_GRADED",
    judgeStatus: "SUCCEEDED",
  },
  {
    questionId: "c",
    score: 40,
    isCorrect: false,
    gradingStatus: "GRADED",
    judgeStatus: null,
  },
];
test("weighted objective percentage differs from correct question ratio; publication is graded", () => {
  const result = summarizeSubmission(questions, answers, "PUBLISHED");
  assert.equal(result.objectivePercentage, (7 / 12) * 100);
  assert.equal(result.objectiveCorrectCount, 1);
  assert.equal(result.objectiveCount, 2);
  assert.equal(result.displayStatus, "已批改");
});
test("pending, missing and system failures do not become zero scores", () => {
  for (const state of [
    null,
    "PENDING",
    "RUNNING",
    "SYSTEM_ERROR",
    "CANCELLED",
  ]) {
    const result = summarizeSubmission(
      questions,
      answers.map((a) =>
        a.questionId === "b" ? { ...a, judgeStatus: state } : a,
      ),
      "SUBMITTED",
    );
    assert.equal(result.objectivePercentage, null);
    assert.equal(result.objectiveJudgedCount, 1);
    assert.equal(
      result.displayStatus,
      state === "SYSTEM_ERROR" || state === "CANCELLED" ? "判题异常" : "待判题",
    );
  }
  assert.equal(
    summarizeSubmission(questions, [], "SUBMITTED").objectivePercentage,
    null,
  );
});
test("zero, full marks, no objectives and zero denominator remain distinct", () => {
  const q = questions.slice(0, 1);
  assert.equal(
    summarizeSubmission(
      q,
      [{ ...answers[0], score: 0, isCorrect: false }],
      "GRADED",
    ).objectivePercentage,
    0,
  );
  assert.equal(
    summarizeSubmission(q, answers, "GRADED").objectivePercentage,
    100,
  );
  assert.equal(summarizeSubmission([], [], "GRADED").objectivePercentage, null);
  assert.equal(
    summarizeSubmission(
      [{ ...q[0], points: 0 }],
      [{ ...answers[0], score: 0 }],
      "GRADED",
    ).objectivePercentage,
    null,
  );
  assert.equal(
    summarizeSubmission(
      questions,
      answers.map((a) =>
        a.questionId === "c"
          ? { ...a, score: null, gradingStatus: "MANUAL_REVIEW_REQUIRED" }
          : a,
      ),
      "PENDING_REVIEW",
    ).displayStatus,
    "待批改",
  );
});
test("partial score marked correct does not count as a fully correct answer", () => {
  assert.equal(
    summarizeSubmission(
      questions,
      answers.map((a) => ({ ...a, isCorrect: true })),
      "GRADED",
    ).objectiveCorrectCount,
    1,
  );
});

import { questionTextBlocks } from "../../services/assignments/question-text";
test("frozen text preserves indentation and keeps prose outside code scroll areas", () => {
  const text =
    "请完成以下代码：\n```python\nfor i in range(3):\n    print(i)\n```\n说明不截断";
  const blocks = questionTextBlocks(text);
  assert.equal(blocks.filter((b) => b.code).length, 1);
  assert.equal(
    blocks.find((b) => b.code)?.text,
    "for i in range(3):\n    print(i)\n",
  );
  assert.ok(blocks.some((b) => !b.code && b.text.includes("说明不截断")));
  const plain = questionTextBlocks(
    "解释如下\nvalues = [1, 2]\nprint(values)\n请说明输出",
  );
  assert.equal(plain.filter((b) => b.code).length, 1);
  assert.equal(
    plain.find((b) => b.code)?.text,
    "values = [1, 2]\nprint(values)",
  );
});
