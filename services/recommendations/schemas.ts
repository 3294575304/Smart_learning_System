import { QuestionType } from "@prisma/client";
import { z } from "zod";

const resourceIdSchema = z.string().trim().min(1).max(128);

export const teacherPracticeScopeSchema = z
  .object({
    candidateQuestionIds: z
      .array(resourceIdSchema)
      .min(1)
      .max(1_000)
      .transform((ids) => [...new Set(ids)]),
    knowledgePointIds: z
      .array(resourceIdSchema)
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
    studentId: resourceIdSchema,
    classroomId: resourceIdSchema,
    recommendedDifficulty: z.number().int().min(1).max(5),
    count: z.number().int().min(1).max(50).default(10),
    teacherScope: teacherPracticeScopeSchema,
  })
  .strict();

export type RecommendationRequest = z.output<
  typeof recommendationRequestSchema
>;
