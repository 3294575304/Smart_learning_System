import assert from "node:assert/strict";
import test from "node:test";

import {
  assignmentUpsertSchema,
  autosaveAnswersSchema,
} from "../../services/assignments/schemas";

const classroomId = "cm12345678901234567890123";
const questionId = "cm22345678901234567890123";

function validAssignment() {
  return {
    title: "七年级数学作业",
    description: "完成后提交",
    classroomId,
    publishedAt: new Date("2026-07-15T08:00:00.000Z"),
    dueAt: new Date("2026-07-16T08:00:00.000Z"),
    allowResubmission: false,
    questions: [{ questionId, sortOrder: 1, points: 10 }],
  };
}

test("assignment validation accepts a complete draft", () => {
  assert.equal(
    assignmentUpsertSchema.safeParse(validAssignment()).success,
    true,
  );
});

test("assignment validation rejects duplicate questions and order values", () => {
  const input = validAssignment();
  input.questions.push({ questionId, sortOrder: 1, points: 5 });
  const parsed = assignmentUpsertSchema.safeParse(input);
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.ok(parsed.error.issues.length >= 2);
});

test("assignment validation rejects a deadline before publish time", () => {
  const parsed = assignmentUpsertSchema.safeParse({
    ...validAssignment(),
    dueAt: new Date("2026-07-15T07:59:59.000Z"),
  });
  assert.equal(parsed.success, false);
});

test("autosave validation rejects duplicate selected options", () => {
  const parsed = autosaveAnswersSchema.safeParse({
    version: 0,
    answers: [
      {
        assignmentQuestionId: questionId,
        kind: "CHOICE",
        optionIds: [classroomId, classroomId],
      },
    ],
  });
  assert.equal(parsed.success, false);
});

test("autosave validates the optional per-question response time", () => {
  const valid = autosaveAnswersSchema.safeParse({
    version: 0,
    answers: [
      {
        assignmentQuestionId: questionId,
        kind: "BOOLEAN",
        value: true,
        responseTimeMs: 30_000,
      },
    ],
  });
  const invalid = autosaveAnswersSchema.safeParse({
    version: 0,
    answers: [
      {
        assignmentQuestionId: questionId,
        kind: "BOOLEAN",
        value: true,
        responseTimeMs: 86_400_001,
      },
    ],
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
