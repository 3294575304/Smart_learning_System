import { ExamType, QuestionType } from "@prisma/client";
import { z } from "zod";

import { questionAnswerSchema } from "@/services/questions/schemas";
import { programmingConfigRevisionInputSchema } from "@/services/programming-questions/schemas";

export const paperDraftConfigSchema = z.object({
  expectedRevision: z.number().int().positive(),
  type: z.nativeEnum(ExamType),
  title: z.string().trim().max(120),
  startsAt: z.coerce.date().nullable(),
  endsAt: z.coerce.date().nullable(),
  allowedSwitches: z.number().int().min(0).max(20),
  classroomIds: z.array(z.string().cuid()).max(20),
});

export const paperDraftQuestionSchema = z.object({
  title: z.string().trim().max(120),
  content: z.string().trim().max(5000),
  type: z.nativeEnum(QuestionType),
  objectiveCodes: z.array(z.string().trim()).max(20).default([]),
  options: z
    .array(
      z.object({
        label: z.string().trim().max(8),
        content: z.string().trim().max(1000),
        sortOrder: z.number().int().positive(),
      }),
    )
    .max(20),
  answer: questionAnswerSchema.nullable(),
  explanation: z.string().trim().max(5000),
  tags: z.array(z.string().trim().max(30)).max(10),
  programmingConfig: programmingConfigRevisionInputSchema
    .nullable()
    .default(null),
});

export const paperDraftQuestionEditSchema = z.object({
  expectedRevision: z.number().int().positive(),
  question: paperDraftQuestionSchema,
  points: z.number().positive().max(10000),
});

export const paperDraftReviewSchema = z.object({
  expectedRevision: z.number().int().positive(),
});

export const paperDraftOrderSchema = z.object({
  expectedRevision: z.number().int().positive(),
  questionIds: z.array(z.string().cuid()).min(1).max(200),
});

export const paperDraftCropSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    sourceAssetId: z.string().cuid(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((value) => value.x + value.width <= 1 && value.y + value.height <= 1);

export const paperDraftPublishSchema = z.object({
  expectedRevision: z.number().int().positive(),
  requestId: z.string().uuid(),
});

export type PaperDraftQuestion = z.output<typeof paperDraftQuestionSchema>;
