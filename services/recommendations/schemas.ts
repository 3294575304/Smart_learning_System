import { QuestionType, RecommendationStatus } from "@prisma/client";
import { z } from "zod";

export const MAX_RECOMMENDATION_CANDIDATE_IDS = 1_000;

export const recommendationResourceIdSchema = z.string().trim().min(1).max(128);

export const teacherPracticeScopeSchema = z
  .object({
    candidateQuestionIds: z
      .array(recommendationResourceIdSchema)
      .min(1)
      .max(MAX_RECOMMENDATION_CANDIDATE_IDS)
      .transform((ids) => [...new Set(ids)]),
    knowledgePointIds: z
      .array(recommendationResourceIdSchema)
      .max(200)
      .default([])
      .transform((ids) => [...new Set(ids)]),
    types: z
      .array(z.nativeEnum(QuestionType))
      .max(5)
      .default([])
      .transform((types) => [...new Set(types)]),
    tags: z
      .array(z.string().trim().min(1).max(50))
      .max(20)
      .default([])
      .transform((tags) => [...new Set(tags)]),
  })
  .strict();

export const recommendationRequestSchema = z
  .object({
    studentId: recommendationResourceIdSchema,
    classroomId: recommendationResourceIdSchema,
    recommendedDifficulty: z.number().int().min(1).max(5),
    count: z.number().int().min(1).max(50).default(10),
    teacherScope: teacherPracticeScopeSchema,
  })
  .strict();

export type RecommendationRequest = z.output<
  typeof recommendationRequestSchema
>;

export const recommendationGenerationApiSchema = z
  .object({
    studentId: recommendationResourceIdSchema,
    classroomId: recommendationResourceIdSchema.optional(),
    recommendedDifficulty: z.number().int().min(1).max(5).default(3),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict();

export const recommendationListQuerySchema = z
  .object({
    status: z.nativeEnum(RecommendationStatus).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: recommendationResourceIdSchema.optional(),
  })
  .strict();

export const recommendationIdSchema = recommendationResourceIdSchema;

const recommendationPracticeAnswerBase = {
  questionId: recommendationResourceIdSchema,
  responseTimeMs: z.number().int().min(0).max(86_400_000).optional(),
};

export const recommendationPracticeAnswerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...recommendationPracticeAnswerBase,
      kind: z.literal("CHOICE"),
      optionIds: z
        .array(recommendationResourceIdSchema)
        .min(1, "请至少选择一个选项")
        .max(20)
        .refine((items) => new Set(items).size === items.length, {
          message: "选项不能重复",
        }),
    })
    .strict(),
  z
    .object({
      ...recommendationPracticeAnswerBase,
      kind: z.literal("BOOLEAN"),
      value: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...recommendationPracticeAnswerBase,
      kind: z.literal("TEXT"),
      value: z
        .string()
        .max(10000, "答案不能超过 10000 个字符")
        .refine((text) => text.trim().length > 0, "请输入答案"),
    })
    .strict(),
]);

export const recommendationPracticeSubmitSchema = z
  .object({
    idempotencyKey: z.string().uuid("幂等标识格式无效"),
    answers: z.array(recommendationPracticeAnswerSchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    const questionIds = value.answers.map((answer) => answer.questionId);
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "同一道推荐题不能重复提交答案",
      });
    }
  });

export type RecommendationGenerationApiInput = z.output<
  typeof recommendationGenerationApiSchema
>;
export type RecommendationListQuery = z.output<
  typeof recommendationListQuerySchema
>;
export type RecommendationPracticeAnswerInput = z.output<
  typeof recommendationPracticeAnswerSchema
>;
export type RecommendationPracticeSubmitData = z.output<
  typeof recommendationPracticeSubmitSchema
>;
