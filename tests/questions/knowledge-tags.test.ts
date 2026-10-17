import assert from "node:assert/strict";
import test from "node:test";
import { editQuestionKnowledgeTag } from "@/services/questions/knowledge-tags";
import { questionUpsertSchema } from "@/services/questions/schemas";

test("老师可只填写自定义知识点创建题目，不必选择固定分类", () => {
  const result = questionUpsertSchema.safeParse({
    title: "函数参数",
    content: "Python支持默认参数吗？",
    type: "TRUE_FALSE",
    difficulty: 2,
    options: [],
    answer: { kind: "BOOLEAN", value: true },
    explanation: "可在参数定义时指定默认值。",
    knowledgePointIds: [],
    tags: ["函数参数"],
    visibility: "PRIVATE",
  });
  assert.equal(result.success, true);
});
test("知识点标签为空且没有分类时给出明确校验错误", () => {
  const result = questionUpsertSchema.safeParse({
    title: "函数参数",
    content: "Python支持默认参数吗？",
    type: "TRUE_FALSE",
    difficulty: 2,
    options: [],
    answer: { kind: "BOOLEAN", value: true },
    explanation: "支持默认参数。",
    knowledgePointIds: [],
    tags: [],
    visibility: "PRIVATE",
  });
  assert.equal(result.success, false);
  if (!result.success)
    assert.ok(result.error.issues.some((issue) => issue.path[0] === "tags"));
});
test("添加、编辑知识点保持原输入且拒绝重复、超量或失效编辑位置", () => {
  const initial = ["列表"];
  assert.deepEqual(editQuestionKnowledgeTag(initial, " 切片 "), {
    tags: ["列表", "切片"],
  });
  assert.deepEqual(editQuestionKnowledgeTag(initial, "列表索引", 0), {
    tags: ["列表索引"],
  });
  assert.ok(editQuestionKnowledgeTag(initial, "列表").error);
  assert.ok(
    editQuestionKnowledgeTag(
      Array.from({ length: 10 }, (_, i) => String(i)),
      "第11项",
    ).error,
  );
  assert.ok(editQuestionKnowledgeTag(initial, "切片", 3).error);
  assert.deepEqual(initial, ["列表"]);
});
