import { QuestionType } from "@prisma/client";
import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const supportedTypes = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.FILL_BLANK,
] as const;

export const courseTeachingProgressSchema = z
  .object({
    graphVersionId: idSchema,
    expectedRevision: z.number().int().min(0),
    conceptIds: z
      .array(idSchema)
      .min(1, "请至少选择一个已授知识点")
      .max(500)
      .transform((ids) => [...new Set(ids)]),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export const courseRecommendationGenerationSchema = z
  .object({
    classroomId: idSchema,
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
    count: z.number().int().min(1).max(20).default(10),
    difficulty: z.number().int().min(1).max(5).default(3),
  })
  .strict();

export const courseRecommendationPathSchema = z
  .object({ courseId: idSchema })
  .strict();

export type CourseTeachingProgressInput = z.output<
  typeof courseTeachingProgressSchema
>;
export type CourseRecommendationGenerationInput = z.output<
  typeof courseRecommendationGenerationSchema
>;
