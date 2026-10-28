import { QuestionType } from "@prisma/client";
import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const supportedTypes = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.FILL_BLANK,
  QuestionType.PYTHON_PROGRAMMING,
] as const;

export const courseTeachingProgressSchema = z
  .object({
    graphVersionId: idSchema,
    classroomId: idSchema.optional(),
    expectedRevision: z.number().int().min(0),
    conceptIds: z
      .array(idSchema)
      .max(500)
      .transform((ids) => [...new Set(ids)]),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const courseRecommendationGenerationSchema = z
  .object({
    requestId: z.string().uuid().optional(),
    classroomId: idSchema,
    chapterIds: z.array(idSchema).max(50).optional(),
    mode: z.enum(["PRACTICE", "TEST"]).optional(),
    template: z
      .enum(["CHOICE20", "TRUE_FALSE10", "PYTHON5", "MIXED_TEST50"])
      .optional(),
    conceptIds: z
      .array(idSchema)
      .max(100)
      .default([])
      .transform((ids) => [...new Set(ids)]),
    questionTypes: z
      .array(z.enum(supportedTypes))
      .max(supportedTypes.length)
      .default([])
      .transform((types) => [...new Set(types)]),
    practiceCount: z.number().int().min(1).max(50).optional(),
    count: z.number().int().min(1).max(50).default(10),
    difficulty: z.number().int().min(1).max(5).default(3),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.practiceCount !== undefined &&
      (value.mode === "TEST" || value.template === "MIXED_TEST50")
    ) {
      context.addIssue({
        code: "custom",
        path: ["practiceCount"],
        message: "测试题量固定，不接受自定义练习题量",
      });
    }
    if (value.mode === "TEST" && value.template !== "MIXED_TEST50") {
      context.addIssue({
        code: "custom",
        path: ["template"],
        message: "测试模式必须使用 50 题综合测试模板",
      });
    }
    if (value.mode === "PRACTICE" && value.template === "MIXED_TEST50") {
      context.addIssue({
        code: "custom",
        path: ["template"],
        message: "综合测试模板只能用于测试模式",
      });
    }
  });

export const courseRecommendationPathSchema = z
  .object({ courseId: idSchema })
  .strict();

export const courseRecommendationPolicySchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    weaknessWeight: z.number().int().min(0).max(100),
    prerequisiteWeight: z.number().int().min(0).max(100),
    difficultyWeight: z.number().int().min(0).max(100),
    errorPatternWeight: z.number().int().min(0).max(100),
    freshnessWeight: z.number().int().min(0).max(100),
    teacherPriorityWeight: z.number().int().min(0).max(100),
    recentWindowDays: z.number().int().min(1).max(90),
    difficultyTolerance: z.number().int().min(0).max(4),
    maxQuestionCount: z.number().int().min(1).max(50),
  })
  .strict()
  .refine(
    (value) =>
      value.weaknessWeight +
        value.prerequisiteWeight +
        value.difficultyWeight +
        value.errorPatternWeight +
        value.freshnessWeight +
        value.teacherPriorityWeight ===
      100,
    { message: "推荐权重之和必须为 100%" },
  );

export type CourseTeachingProgressInput = z.output<
  typeof courseTeachingProgressSchema
>;
export type CourseRecommendationGenerationInput = z.output<
  typeof courseRecommendationGenerationSchema
>;
export type CourseRecommendationPolicyInput = z.output<
  typeof courseRecommendationPolicySchema
>;
