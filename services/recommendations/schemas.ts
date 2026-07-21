import { QuestionType, RecommendationStatus } from "@prisma/client";
import { z } from "zod";

export const recommendationResourceIdSchema = z.string().trim().min(1).max(128);

export const teacherPracticeScopeSchema = z
  .object({
    candidateQuestionIds: z
      .array(recommendationResourceIdSchema)
      .min(1)
      .max(1_000)
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

export type RecommendationGenerationApiInput = z.output<
  typeof recommendationGenerationApiSchema
>;
export type RecommendationListQuery = z.output<
  typeof recommendationListQuerySchema
>;
