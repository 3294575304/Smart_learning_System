import { QuestionType } from "@prisma/client";
import { z } from "zod";

import { questionAnswerSchema } from "@/services/questions/schemas";

export const EXAM_PAPER_JOB_TYPE = "EXAM_PAPER_PARSE";
export const EXAM_PAPER_PROMPT_VERSION = "exam-paper-parse-v2";

export const examPaperJobInputSchema = z.object({
  draftId: z.string().cuid(),
  revision: z.number().int().positive(),
});

export const examPaperAIQuestionSchema = z.object({
  title: z.string().trim().max(120),
  content: z.string().trim().max(5000),
  type: z.nativeEnum(QuestionType),
  objectiveCodes: z.array(z.string().trim()).max(20).default([]),
  reviewIssues: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
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
  points: z.number().positive().max(10000).nullable(),
  sourceLocator: z.string().trim().max(200),
  imageIds: z.array(z.string().trim().min(1)).max(5),
  imageRegions: z
    .array(
      z.object({
        imageId: z.string().trim().min(1),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      }),
    )
    .max(5)
    .default([]),
  answerSource: z.enum(["SOURCE", "AI_INFERRED", "MISSING"]),
  confidence: z.number().min(0).max(1).nullable().default(null),
});

export const examPaperAIOutputSchema = z.object({
  questions: z.array(examPaperAIQuestionSchema).max(50),
});

export type ExamPaperAIQuestion = z.output<typeof examPaperAIQuestionSchema>;
export type ExamPaperAIInput = {
  format: string;
  sourceName: string;
  text: string;
  chunkLabel: string;
  images: Array<{ id: string; dataUrl: string }>;
  objectives: Array<{ code: string; title: string; description: string }>;
};
