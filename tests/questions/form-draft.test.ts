import assert from "node:assert/strict";
import test from "node:test";
import { QuestionType } from "@prisma/client";
import {
  defaultAnswerDraft,
  removeChoiceOption,
  questionValidationMessages,
} from "@/services/questions/form-draft";
import { questionUpsertSchema } from "@/services/questions/schemas";

test("六种题型使用匹配的答案契约，并要求教师完善答案", () => {
  for (const type of Object.values(QuestionType)) {
    const draft = defaultAnswerDraft(type);
    draft.options.forEach((option) => {
      option.content = `内容 ${option.label}`;
    });
    if (draft.answer.kind === "CHOICE")
      draft.answer.correctOptionLabels =
        type === "SINGLE_CHOICE" ? ["C"] : ["A", "C"];
    if (draft.answer.kind === "TEXT")
      draft.answer.acceptableAnswers = ["0", "零"];
    if (draft.answer.kind === "REFERENCE")
      draft.answer.value = "参考答案及评分要点";
    const input = {
      title: "创建验收",
      content: "题干",
      type,
      difficulty: 3,
      ...draft,
      explanation: "解析",
      tags: ["知识点"],
      knowledgePointIds: [],
      visibility: "PRIVATE",
    };
    assert.equal(questionUpsertSchema.safeParse(input).success, true, type);
    assert.equal(
      questionUpsertSchema.safeParse({ ...input, answer: { kind: "INVALID" } })
        .success,
      false,
    );
  }
});

test("删除选项按内容身份重排正确答案，删除正确项不会擅自选择其他答案", () => {
  const draft = defaultAnswerDraft("MULTIPLE_CHOICE");
  draft.options.forEach((option) => {
    option.content = option.label;
  });
  draft.answer = { kind: "CHOICE", correctOptionLabels: ["A", "C"] };
  const next = removeChoiceOption(draft, 1);
  assert.deepEqual(
    next.options.map((o) => [o.label, o.content]),
    [
      ["A", "A"],
      ["B", "C"],
      ["C", "D"],
    ],
  );
  assert.deepEqual(next.answer, {
    kind: "CHOICE",
    correctOptionLabels: ["A", "B"],
  });
  assert.deepEqual(removeChoiceOption(draft, 2).answer, {
    kind: "CHOICE",
    correctOptionLabels: ["A"],
  });
  assert.equal(draft.options.length, 4);
});

test("嵌套答案与选项错误可见，忽略 DOM ref 并去重", () => {
  assert.deepEqual(
    questionValidationMessages({
      answer: { acceptableAnswers: [{ message: "填空答案不能为空" }] },
      options: [{ content: { message: "选项内容不能为空", ref: {} } }],
      other: { message: "选项内容不能为空" },
    }),
    ["填空答案不能为空", "选项内容不能为空"],
  );
});
