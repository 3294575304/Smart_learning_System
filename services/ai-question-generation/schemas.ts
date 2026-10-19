import { QuestionType } from "@prisma/client";
import { z } from "zod";

import { programmingConfigRevisionInputSchema } from "@/services/programming-questions/schemas";
import {
  questionAnswerSchema,
  questionUpsertSchema,
} from "@/services/questions/schemas";

export const AI_QUESTION_JOB_TYPE = "AI_QUESTION_GENERATION";
export const AI_QUESTION_PROMPT_VERSION = "ai-question-v2";
export const AI_QUESTION_RULE_VERSION = "ai-question-review-v2";

export const questionGenerationRequestSchema = z
  .object({
    courseId: z.string().cuid(),
    mode: z.enum(["RANGE", "ANALOGY", "FILE"]),
    chapterCode: z.string().trim().max(100).nullable().default(null),
    conceptIds: z.array(z.string().cuid()).max(20).default([]),
    sourceQuestionId: z.string().cuid().nullable().default(null),
    bloomLevel: z.enum([
      "REMEMBER",
      "UNDERSTAND",
      "APPLY",
      "ANALYZE",
      "EVALUATE",
      "CREATE",
    ]),
    difficulty: z.number().int().min(1).max(5),
    counts: z.record(
      z.nativeEnum(QuestionType),
      z.number().int().min(0).max(10),
    ),
    singleChoiceOptions: z.number().int().min(2).max(6),
    multipleChoiceOptions: z.number().int().min(2).max(6),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((value, ctx) => {
    const total = Object.values(value.counts).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (total < 1 || total > 20)
      ctx.addIssue({
        code: "custom",
        path: ["counts"],
        message: "每批生成 1–20 道题",
      });
    if (value.mode === "ANALOGY" && !value.sourceQuestionId)
      ctx.addIssue({
        code: "custom",
        path: ["sourceQuestionId"],
        message: "请选择原题",
      });
    if (value.mode !== "ANALOGY" && value.sourceQuestionId)
      ctx.addIssue({
        code: "custom",
        path: ["sourceQuestionId"],
        message: "当前模式不使用原题",
      });
  });

export const generatedQuestionSchema = z.object({
  question: z.object({
    title: z.string(),
    content: z.string(),
    type: z.nativeEnum(QuestionType),
    difficulty: z.number(),
    options: z.array(
      z.object({
        label: z.string(),
        content: z.string(),
        sortOrder: z.number(),
      }),
    ),
    answer: questionAnswerSchema,
    explanation: z.string(),
    tags: z.array(z.string()).default([]),
  }),
  programmingConfig: programmingConfigRevisionInputSchema.nullable(),
  sourceIds: z.array(z.string().min(1)).min(1).max(8),
  primaryConceptId: z.string().cuid().nullable(),
});

export const generatedQuestionsOutputSchema = z.object({
  questions: z.array(generatedQuestionSchema).max(10),
});

export const questionReviewOutputSchema = z.object({
  reviews: z
    .array(
      z.object({
        index: z.number().int().min(0).max(9),
        factsSupported: z.boolean(),
        answerConsistent: z.boolean(),
        clear: z.boolean(),
        difficultyAligned: z.boolean(),
        reason: z.string().max(300),
      }),
    )
    .max(10),
});

export const editCandidateSchema = z.object({
  expectedRevision: z.number().int().min(1),
  question: questionUpsertSchema,
  programmingConfig: programmingConfigRevisionInputSchema.nullable(),
  sourceIds: z.array(z.string().min(1)).min(1).max(8),
});

export const candidateActionSchema = z.object({
  expectedRevision: z.number().int().min(1),
  primaryConceptId: z.string().cuid().nullable().optional(),
});

export const confirmAllCandidatesSchema = z.object({
  candidates: z
    .array(
      z.object({
        id: z.string().cuid(),
        expectedRevision: z.number().int().min(1),
        primaryConceptId: z.string().cuid().nullable(),
      }),
    )
    .min(1)
    .max(20),
});

export const questionGenerationJobInputSchema = z.object({
  batchId: z.string().cuid(),
  generationRevision: z.number().int().min(1),
});

export type QuestionGenerationRequest = z.output<
  typeof questionGenerationRequestSchema
>;
export type GeneratedQuestion = z.output<typeof generatedQuestionSchema>;

export interface QuestionGenerationAIInput {
  mode: "RANGE" | "ANALOGY" | "FILE";
  courseName: string;
  type: QuestionType;
  count: number;
  sequence: number;
  difficulty: number;
  bloomLevel: string;
  optionCount: number | null;
  evidence: Array<{ id: string; locator: string; text: string }>;
  sourceQuestion: { title: string; content: string } | null;
  concepts: Array<{ id: string; name: string }>;
}

export interface QuestionGenerationReviewInput {
  type: QuestionType;
  difficulty: number;
  evidence: QuestionGenerationAIInput["evidence"];
  draftText: string;
  count: number;
}
