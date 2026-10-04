import assert from "node:assert/strict";
import test from "node:test";
import { assignmentUpsertSchema } from "../../services/assignments/schemas";

const base = {
  title: "实验报告",
  classroomId: "cmf00000000000000000000001",
  questions: [],
};
test("standalone tasks validate rubric, points and exclusive assignment format", () => {
  const submissionTask = { prompt: "分析实验结果并上传截图", points: 100 };
  const result = assignmentUpsertSchema.parse({
    ...base,
    submissionTask,
    allowAttachments: true,
  });
  assert.equal(result.submissionTask?.referenceAnswer, "");
  assert.equal(result.allowAttachments, true);
  assert.equal(
    assignmentUpsertSchema.safeParse({
      ...base,
      submissionTask: { ...submissionTask, points: 0 },
    }).success,
    false,
  );
  assert.equal(
    assignmentUpsertSchema.safeParse({
      ...base,
      submissionTask,
      questions: [
        { questionId: "cmf00000000000000000000002", sortOrder: 1, points: 10 },
      ],
    }).success,
    false,
  );
  assert.equal(assignmentUpsertSchema.safeParse(base).success, true);
});
