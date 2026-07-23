import { QuestionType } from "@prisma/client";
import { z } from "zod";

const optionalBooleanQuery = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => (typeof value === "boolean" ? value : value === "true"))
  .optional();

const recentDaysSchema = z
  .union([
    z.literal(7),
    z.literal(30),
    z.literal(90),
    z.enum(["7", "30", "90"]),
  ])
  .transform((value) => Number(value))
  .optional();

export const wrongQuestionIdSchema = z.string().cuid("错题记录 ID 格式无效");

export const wrongQuestionListQuerySchema = z
  .object({
    keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
    classroomId: z.string().cuid("班级 ID 格式无效").optional(),
    knowledgePointId: z.string().cuid("知识点 ID 格式无效").optional(),
    type: z.nativeEnum(QuestionType).optional(),
    isMastered: optionalBooleanQuery,
    recentDays: recentDaysSchema,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();

export const wrongQuestionMasterySchema = z
  .object({
    isMastered: z.boolean(),
  })
  .strict();

const practiceAnswerBase = z.object({
  responseTimeMs: z.number().int().min(0).max(86_400_000).optional(),
});

export const wrongQuestionPracticeSchema = z
  .object({
    answer: z.discriminatedUnion("kind", [
      practiceAnswerBase
        .extend({
          kind: z.literal("CHOICE"),
          optionIds: z
            .array(z.string().cuid("选项 ID 格式无效"))
            .min(1, "请至少选择一个选项")
            .max(20)
            .refine((items) => new Set(items).size === items.length, {
              message: "选项不能重复",
            }),
        })
        .strict(),
      practiceAnswerBase
        .extend({
          kind: z.literal("BOOLEAN"),
          value: z.boolean(),
        })
        .strict(),
      practiceAnswerBase
        .extend({
          kind: z.literal("TEXT"),
          value: z
            .string()
            .max(10_000, "答案不能超过 10000 个字符")
            .refine((value) => value.trim().length > 0, "请输入答案"),
        })
        .strict(),
    ]),
  })
  .strict();

export type WrongQuestionListQuery = z.output<
  typeof wrongQuestionListQuerySchema
>;
export type WrongQuestionMasteryInput = z.output<
  typeof wrongQuestionMasterySchema
>;
export type WrongQuestionPracticeInput = z.output<
  typeof wrongQuestionPracticeSchema
>;
export type WrongQuestionPracticeAnswer = WrongQuestionPracticeInput["answer"];
