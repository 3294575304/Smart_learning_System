import { QuestionType, StudentSelfReflectionStatus } from "@prisma/client";
import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const practiceTypes = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.FILL_BLANK,
  QuestionType.PYTHON_PROGRAMMING,
] as const;

export const reflectionPracticeRequestSchema = z
  .object({
    conceptIds: z
      .array(idSchema)
      .max(20)
      .transform((ids) => [...new Set(ids)]),
    questionTypes: z
      .array(z.enum(practiceTypes))
      .max(practiceTypes.length)
      .transform((types) => [...new Set(types)]),
    count: z.number().int().min(1).max(20),
    difficulty: z.number().int().min(1).max(5),
  })
  .strict();

export const selfReflectionAIInputSchema = z
  .object({
    anonymousStudentId: z.string().regex(/^[a-f0-9]{64}$/u),
    text: z.string().trim().min(2).max(4_000),
    concepts: z
      .array(
        z
          .object({
            id: idSchema,
            code: z.string().max(100),
            name: z.string().max(300),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export const selfReflectionOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(1_000),
    goals: z.array(z.string().trim().min(1).max(300)).max(20),
    difficulties: z.array(z.string().trim().min(1).max(300)).max(20),
    learningHabits: z.array(z.string().trim().min(1).max(300)).max(20),
    practiceRequest: reflectionPracticeRequestSchema.nullable(),
  })
  .strict();

export const createSelfReflectionSchema = z
  .object({ text: z.string().trim().min(2).max(4_000) })
  .strict();
export const updateSelfReflectionSchema = selfReflectionOutputSchema
  .omit({ practiceRequest: true })
  .extend({
    practiceRequest: reflectionPracticeRequestSchema.nullable().optional(),
    status: z.literal(StudentSelfReflectionStatus.CONFIRMED),
  })
  .strict();
export const selfReflectionPathSchema = z
  .object({ courseId: idSchema, reflectionId: idSchema.optional() })
  .strict();

export type SelfReflectionAIInput = z.output<
  typeof selfReflectionAIInputSchema
>;
export type SelfReflectionOutput = z.output<typeof selfReflectionOutputSchema>;
