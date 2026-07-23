import { QuestionType, QuestionVisibility } from "@prisma/client";
import { z } from "zod";

const optionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "选项标签不能为空")
    .max(8, "选项标签不能超过 8 个字符")
    .regex(/^[A-Z0-9]+$/, "选项标签只能包含大写字母或数字"),
  content: z
    .string()
    .trim()
    .min(1, "选项内容不能为空")
    .max(1000, "选项内容不能超过 1000 个字符"),
  sortOrder: z.number().int().min(1).max(20),
});

const choiceAnswerSchema = z.object({
  kind: z.literal("CHOICE"),
  correctOptionLabels: z
    .array(z.string().trim().min(1))
    .min(1, "请选择正确答案"),
});

const booleanAnswerSchema = z.object({
  kind: z.literal("BOOLEAN"),
  value: z.boolean(),
});

const textAnswerSchema = z.object({
  kind: z.literal("TEXT"),
  acceptableAnswers: z
    .array(z.string().trim().min(1, "填空答案不能为空").max(500))
    .min(1, "至少需要一个可接受答案")
    .max(20, "可接受答案不能超过 20 个"),
  caseSensitive: z.boolean(),
});

const referenceAnswerSchema = z.object({
  kind: z.literal("REFERENCE"),
  value: z
    .string()
    .trim()
    .min(1, "简答题必须提供参考答案")
    .max(5000, "参考答案不能超过 5000 个字符"),
});

export const questionAnswerSchema = z.discriminatedUnion("kind", [
  choiceAnswerSchema,
  booleanAnswerSchema,
  textAnswerSchema,
  referenceAnswerSchema,
]);

export const questionUpsertSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "题目标题至少需要 2 个字符")
      .max(120, "题目标题不能超过 120 个字符"),
    content: z
      .string()
      .trim()
      .min(1, "题干不能为空")
      .max(5000, "题干不能超过 5000 个字符"),
    type: z.nativeEnum(QuestionType),
    difficulty: z.number().int().min(1, "难度最低为 1").max(5, "难度最高为 5"),
    options: z.array(optionSchema).max(20, "选项不能超过 20 个"),
    answer: questionAnswerSchema,
    explanation: z
      .string()
      .trim()
      .min(1, "答案解析不能为空")
      .max(5000, "答案解析不能超过 5000 个字符"),
    knowledgePointIds: z
      .array(z.string().cuid("知识点 ID 格式无效"))
      .min(1, "至少选择一个知识点")
      .max(10, "知识点不能超过 10 个"),
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1, "标签不能为空")
          .max(30, "标签不能超过 30 个字符"),
      )
      .max(10, "标签不能超过 10 个"),
    visibility: z.nativeEnum(QuestionVisibility),
  })
  .superRefine((value, context) => {
    const optionLabels = value.options.map((option) => option.label);
    const optionSortOrders = value.options.map((option) => option.sortOrder);
    if (new Set(optionLabels).size !== optionLabels.length) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "选项标签不能重复",
      });
    }
    if (new Set(optionSortOrders).size !== optionSortOrders.length) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "选项顺序不能重复",
      });
    }
    if (
      new Set(value.knowledgePointIds).size !== value.knowledgePointIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["knowledgePointIds"],
        message: "知识点不能重复",
      });
    }
    const normalizedTags = value.tags.map((tag) => tag.toLocaleLowerCase());
    if (new Set(normalizedTags).size !== normalizedTags.length) {
      context.addIssue({
        code: "custom",
        path: ["tags"],
        message: "标签不能重复",
      });
    }

    if (
      value.type === QuestionType.SINGLE_CHOICE ||
      value.type === QuestionType.MULTIPLE_CHOICE
    ) {
      if (value.options.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "选择题至少需要两个选项",
        });
      }
      if (value.answer.kind !== "CHOICE") {
        context.addIssue({
          code: "custom",
          path: ["answer"],
          message: "选择题答案格式无效",
        });
        return;
      }
      const correctLabels = value.answer.correctOptionLabels;
      if (new Set(correctLabels).size !== correctLabels.length) {
        context.addIssue({
          code: "custom",
          path: ["answer"],
          message: "正确选项不能重复",
        });
      }
      if (correctLabels.some((label) => !optionLabels.includes(label))) {
        context.addIssue({
          code: "custom",
          path: ["answer"],
          message: "正确答案必须对应已有选项",
        });
      }
      if (
        value.type === QuestionType.SINGLE_CHOICE &&
        correctLabels.length !== 1
      ) {
        context.addIssue({
          code: "custom",
          path: ["answer"],
          message: "单选题必须且只能有一个正确选项",
        });
      }
      if (
        value.type === QuestionType.MULTIPLE_CHOICE &&
        correctLabels.length < 2
      ) {
        context.addIssue({
          code: "custom",
          path: ["answer"],
          message: "多选题至少需要两个正确选项",
        });
      }
      return;
    }

    if (value.options.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "当前题型不能包含选项",
      });
    }
    if (
      value.type === QuestionType.TRUE_FALSE &&
      value.answer.kind !== "BOOLEAN"
    ) {
      context.addIssue({
        code: "custom",
        path: ["answer"],
        message: "判断题答案必须为正确或错误",
      });
    }
    if (value.type === QuestionType.FILL_BLANK) {
      if (value.answer.kind !== "TEXT") {
        context.addIssue({
          code: "custom",
          path: ["answer"],
          message: "填空题答案格式无效",
        });
      } else {
        const answers = value.answer.acceptableAnswers.map((answer) =>
          value.answer.kind === "TEXT" && value.answer.caseSensitive
            ? answer
            : answer.toLocaleLowerCase(),
        );
        if (new Set(answers).size !== answers.length) {
          context.addIssue({
            code: "custom",
            path: ["answer", "acceptableAnswers"],
            message: "可接受答案不能重复",
          });
        }
      }
    }
    if (
      value.type === QuestionType.SHORT_ANSWER &&
      value.answer.kind !== "REFERENCE"
    ) {
      context.addIssue({
        code: "custom",
        path: ["answer"],
        message: "简答题答案格式无效",
      });
    }
  });

export const questionIdSchema = z.string().cuid("题目 ID 格式无效");

export const questionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  scope: z.enum(["OWNED", "PUBLIC"]).default("OWNED"),
  keyword: z
    .string()
    .trim()
    .max(120, "搜索关键词不能超过 120 个字符")
    .optional(),
  type: z.nativeEnum(QuestionType).optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  knowledgePointId: z.string().cuid("知识点 ID 格式无效").optional(),
});

export type QuestionUpsertInput = z.input<typeof questionUpsertSchema>;
export type QuestionUpsertData = z.output<typeof questionUpsertSchema>;
export type QuestionListQuery = z.output<typeof questionListQuerySchema>;
