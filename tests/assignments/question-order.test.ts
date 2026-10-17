import assert from "node:assert/strict";
import test from "node:test";
import type { QuestionType } from "@prisma/client";
import {
  isAssignmentQuestionOrderOrganized,
  organizeAssignmentQuestions,
} from "../../services/assignments/question-order";
import { assignmentUpsertSchema } from "../../services/assignments/schemas";

const types: QuestionType[] = [
  "SHORT_ANSWER",
  "MULTIPLE_CHOICE",
  "PYTHON_PROGRAMMING",
  "FILL_BLANK",
  "SINGLE_CHOICE",
  "TRUE_FALSE",
  "SINGLE_CHOICE",
];
const questions = types.map((type, index) => ({
  id: `cm${String(index).padStart(23, "0")}`,
  type,
  points: index + 0.25,
}));

test("六类题型按选择、判断、填空、编程、简答分组，并保留同类题当前顺序", () => {
  const organized = organizeAssignmentQuestions(questions);
  assert.deepEqual(
    organized.map((q) => q.type),
    [
      "SINGLE_CHOICE",
      "SINGLE_CHOICE",
      "MULTIPLE_CHOICE",
      "TRUE_FALSE",
      "FILL_BLANK",
      "PYTHON_PROGRAMMING",
      "SHORT_ANSWER",
    ],
  );
  assert.deepEqual(
    organized.filter((q) => q.type === "SINGLE_CHOICE").map((q) => q.id),
    [questions[4].id, questions[6].id],
  );
  assert.equal(isAssignmentQuestionOrderOrganized(questions), false);
  assert.equal(isAssignmentQuestionOrderOrganized(organized), true);
});

test("整理不修改原数组、题目身份与分值，重复整理幂等", () => {
  const original = [...questions];
  const organized = organizeAssignmentQuestions(questions);
  assert.deepEqual(questions, original);
  assert.deepEqual(organizeAssignmentQuestions(organized), organized);
  for (const item of organized)
    assert.equal(
      item,
      questions.find((q) => q.id === item.id),
    );
  assert.equal(
    organized.reduce((sum, q) => sum + q.points, 0),
    questions.reduce((sum, q) => sum + q.points, 0),
  );
});

test("空列表、单题和同题型手动顺序均可保留", () => {
  assert.deepEqual(organizeAssignmentQuestions([]), []);
  assert.equal(isAssignmentQuestionOrderOrganized([]), true);
  assert.deepEqual(organizeAssignmentQuestions([questions[0]]), [questions[0]]);
  const sameType = [questions[6], questions[4]];
  assert.deepEqual(organizeAssignmentQuestions(sameType), sameType);
});

test("整理结果生成连续题号，沿用现有保存及发布契约", () => {
  const organized = organizeAssignmentQuestions(questions);
  const input = assignmentUpsertSchema.parse({
    title: "题序整理验收",
    classroomId: "cm12345678901234567890123",
    questions: organized.map((q, index) => ({
      questionId: q.id,
      sortOrder: index + 1,
      points: q.points,
    })),
  });
  assert.deepEqual(
    input.questions.map((q) => q.sortOrder),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    input.questions.map((q) => q.questionId),
    organized.map((q) => q.id),
  );
});
