import assert from "node:assert/strict";
import test from "node:test";
import { QuestionType, QuestionVisibility } from "@prisma/client";

import {
  questionListQuerySchema,
  questionUpsertSchema,
} from "@/services/questions/schemas";

const knowledgePointId = "cmath00000000000000000001";

function baseInput() {
  return {
    title: "基础选择题",
    content: "2 + 3 等于多少？",
    type: QuestionType.SINGLE_CHOICE,
    difficulty: 2,
    options: [
      { label: "A", content: "4", sortOrder: 1 },
      { label: "B", content: "5", sortOrder: 2 },
    ],
    answer: { kind: "CHOICE" as const, correctOptionLabels: ["B"] },
    explanation: "2 与 3 相加等于 5。",
    knowledgePointIds: [knowledgePointId],
    tags: ["计算"],
    visibility: QuestionVisibility.PRIVATE,
  };
}

test("六种题型的有效答案结构均可通过校验", () => {
  const inputs = [
    baseInput(),
    {
      ...baseInput(),
      type: QuestionType.MULTIPLE_CHOICE,
      answer: { kind: "CHOICE" as const, correctOptionLabels: ["A", "B"] },
    },
    {
      ...baseInput(),
      type: QuestionType.TRUE_FALSE,
      options: [],
      answer: { kind: "BOOLEAN" as const, value: true },
    },
    {
      ...baseInput(),
      type: QuestionType.FILL_BLANK,
      options: [],
      answer: {
        kind: "TEXT" as const,
        acceptableAnswers: ["5", "5.0"],
        caseSensitive: false,
      },
    },
    {
      ...baseInput(),
      type: QuestionType.SHORT_ANSWER,
      options: [],
      answer: { kind: "REFERENCE" as const, value: "参考答案" },
    },
    {
      ...baseInput(),
      type: QuestionType.PYTHON_PROGRAMMING,
      options: [],
      answer: { kind: "PROGRAMMING" as const },
    },
  ];
  for (const input of inputs) {
    assert.equal(questionUpsertSchema.safeParse(input).success, true);
  }
});

test("单选题只能有一个正确答案，多选题至少有两个", () => {
  assert.equal(
    questionUpsertSchema.safeParse({
      ...baseInput(),
      answer: { kind: "CHOICE", correctOptionLabels: ["A", "B"] },
    }).success,
    false,
  );
  assert.equal(
    questionUpsertSchema.safeParse({
      ...baseInput(),
      type: QuestionType.MULTIPLE_CHOICE,
      answer: { kind: "CHOICE", correctOptionLabels: ["A"] },
    }).success,
    false,
  );
});

test("非选择题拒绝选项和错误的答案类型", () => {
  assert.equal(
    questionUpsertSchema.safeParse({
      ...baseInput(),
      type: QuestionType.TRUE_FALSE,
      answer: { kind: "BOOLEAN", value: true },
    }).success,
    false,
  );
  assert.equal(
    questionUpsertSchema.safeParse({
      ...baseInput(),
      type: QuestionType.SHORT_ANSWER,
      options: [],
      answer: {
        kind: "TEXT",
        acceptableAnswers: ["答案"],
        caseSensitive: false,
      },
    }).success,
    false,
  );
});

test("难度、知识点、标签和填空答案执行边界校验", () => {
  assert.equal(
    questionUpsertSchema.safeParse({ ...baseInput(), difficulty: 6 }).success,
    false,
  );
  assert.equal(
    questionUpsertSchema.safeParse({ ...baseInput(), knowledgePointIds: [] })
      .success,
    false,
  );
  assert.equal(
    questionUpsertSchema.safeParse({ ...baseInput(), tags: ["重复", "重复"] })
      .success,
    false,
  );
  assert.equal(
    questionUpsertSchema.safeParse({
      ...baseInput(),
      type: QuestionType.FILL_BLANK,
      options: [],
      answer: {
        kind: "TEXT",
        acceptableAnswers: ["Answer", "answer"],
        caseSensitive: false,
      },
    }).success,
    false,
  );
});

test("题库查询支持关键词并限制搜索长度", () => {
  const valid = questionListQuerySchema.safeParse({ keyword: "  方程  " });
  assert.equal(valid.success, true);
  if (valid.success) assert.equal(valid.data.keyword, "方程");
  assert.equal(
    questionListQuerySchema.safeParse({ keyword: "题".repeat(121) }).success,
    false,
  );
});
