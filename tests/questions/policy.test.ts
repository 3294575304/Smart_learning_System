import assert from "node:assert/strict";
import test from "node:test";
import {
  questionListQuerySchema,
  questionUpsertSchema,
} from "@/services/questions/schemas";

const categoryId = "ccategory00000000000000001";

test("题库不再读取 scope，按课程分类筛选共享题目", () => {
  const parsed = questionListQuerySchema.parse({
    scope: "OWNED",
    categoryId,
  });
  assert.equal(parsed.categoryId, categoryId);
  assert.equal("scope" in parsed, false);
});

test("新题必须选择课程分类，修订号仅在编辑时传入", () => {
  const base = {
    title: "课程题目",
    content: "判断命题是否成立。",
    type: "TRUE_FALSE",
    difficulty: 2,
    options: [],
    answer: { kind: "BOOLEAN", value: true },
    explanation: "成立。",
    knowledgePointIds: [],
    tags: ["逻辑"],
  };
  assert.equal(questionUpsertSchema.safeParse(base).success, false);
  assert.equal(
    questionUpsertSchema.safeParse({ ...base, questionCategoryId: categoryId })
      .success,
    true,
  );
  assert.equal(
    questionUpsertSchema.safeParse({
      ...base,
      questionCategoryId: categoryId,
      revision: 3,
    }).success,
    true,
  );
});
