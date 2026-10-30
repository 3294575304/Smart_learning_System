import assert from "node:assert/strict";
import test from "node:test";
import {
  courseSwitchImpact,
  validateEditorAction,
} from "@/services/assignments/editor-review";

const now = new Date("2026-10-27T08:00:00Z");
const input = {
  title: "发布核对",
  classroomId: "cm123456789012345678901234",
  publishedAt: new Date(now.getTime() - 1000),
  dueAt: new Date(now.getTime() + 1000),
  questions: [],
};
test("empty bank draft remains saveable, publication validates content and exact deadline", () => {
  assert.equal(validateEditorAction(input, false, now).questions.length, 0);
  assert.throws(() => validateEditorAction(input, true, now), /选择一道题/);
  const task = {
    ...input,
    submissionTask: { prompt: "附件作业", points: 80, resourceFileIds: [] },
  };
  assert.equal(
    validateEditorAction(task, true, now).submissionTask?.points,
    80,
  );
  assert.throws(
    () => validateEditorAction({ ...task, dueAt: now }, true, now),
    /当前时间/,
  );
  assert.throws(
    () => validateEditorAction({ ...task, publishedAt: undefined }, true, now),
    /设置发布时间/,
  );
});
test("review snapshot detaches mutable arrays and preserves custom scoring and order", () => {
  const questions = [
    { questionId: "cm123456789012345678901235", points: 37.5, sortOrder: 1 },
    { questionId: "cm123456789012345678901236", points: 42.5, sortOrder: 2 },
  ];
  const reviewed = validateEditorAction({ ...input, questions }, true, now);
  questions[0].points = 100;
  questions.reverse();
  assert.deepEqual(
    reviewed.questions.map((q) => [q.sortOrder, q.points]),
    [
      [1, 37.5],
      [2, 42.5],
    ],
  );
});
test("course switch reports incompatible questions and unlinks attachments only across courses", () => {
  const questions = [
    { questionCategoryId: "python", id: "1" },
    { questionCategoryId: "other", id: "2" },
  ];
  assert.deepEqual(courseSwitchImpact(questions, "python", 2, true), {
    retained: [questions[0]],
    removedCount: 1,
    removedAttachments: 2,
  });
  assert.equal(
    courseSwitchImpact(questions, "python", 2, false).removedAttachments,
    0,
  );
  assert.equal(courseSwitchImpact(questions, null, 2, true).retained.length, 2);
  assert.equal(questions.length, 2);
});
