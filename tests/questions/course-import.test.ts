import assert from "node:assert/strict";
import test from "node:test";
import { questionImportCommitSchema } from "@/services/question-import/schemas";
const base = {
  source: { fileName: "questions.pdf", checksum: "a".repeat(64) },
  questions: [
    {
      rowKey: "1",
      title: "布尔值",
      content: "空列表是假值。",
      type: "TRUE_FALSE",
      difficulty: 1,
      options: [],
      answer: { kind: "BOOLEAN", value: true },
      explanation: "空列表转换为 False。",
      tags: ["Python"],
    },
  ],
};
test("按课程导入无需兼容知识点，且必须提供有效课程", () => {
  const result = questionImportCommitSchema.parse({
    ...base,
    courseId: "c1234567890123456789012345",
  });
  assert.deepEqual(result.knowledgePointIds, []);
  assert.equal(questionImportCommitSchema.safeParse(base).success, false);
  assert.equal(
    questionImportCommitSchema.safeParse({ ...base, courseId: "invalid" })
      .success,
    false,
  );
});
test("历史知识点导入契约保留，重复知识点被拒绝", () => {
  const id = "c1234567890123456789012345";
  assert.ok(
    questionImportCommitSchema.safeParse({ ...base, knowledgePointIds: [id] })
      .success,
  );
  assert.equal(
    questionImportCommitSchema.safeParse({
      ...base,
      knowledgePointIds: [id, id],
    }).success,
    false,
  );
});
