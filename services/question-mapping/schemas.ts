import { QuestionGraphBindingType } from "@prisma/client";
import { z } from "zod";

export const QUESTION_MAPPING_PROMPT_VERSION = "question-concept-map-v2";
export const QUESTION_MAPPING_RULE_VERSION = "question-concept-confirm-v1";
export const QUESTION_MAPPING_MODEL = "local-deterministic-mapper-v1";
export const QUESTION_MAPPING_JOB_TYPE = "QUESTION_MAPPING_BATCH";

export interface QuestionMappingAIInput {
  questions: Array<{
    id: string;
    title: string;
    content: string;
    type: string;
    difficulty: number;
  }>;
  concepts: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
  }>;
}

export const questionMappingAIOutputSchema = z
  .object({
    mappings: z
      .array(
        z
          .object({
            questionId: z.string().cuid(),
            candidates: z
              .array(
                z
                  .object({
                    conceptId: z.string().cuid(),
                    confidence: z.number().min(0).max(1),
                    reason: z.string().trim().min(1).max(500),
                  })
                  .strict(),
              )
              .max(3),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .superRefine((value, context) => {
    const questionIds = value.mappings.map((item) => item.questionId);
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["mappings"],
        message: "同一题目不能重复返回映射",
      });
    }
    for (const [index, mapping] of value.mappings.entries()) {
      const conceptIds = mapping.candidates.map((item) => item.conceptId);
      if (new Set(conceptIds).size !== conceptIds.length) {
        context.addIssue({
          code: "custom",
          path: ["mappings", index, "candidates"],
          message: "同一题目的 Concept 候选不能重复",
        });
      }
    }
  });

export const createQuestionMappingBatchSchema = z
  .object({
    questionIds: z.array(z.string().cuid()).min(1).max(50),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine(
    (value) => new Set(value.questionIds).size === value.questionIds.length,
    {
      path: ["questionIds"],
      message: "题目不能重复",
    },
  );

export const questionMappingPathSchema = z.object({
  batchId: z.string().cuid(),
});

export const courseQuestionMappingPathSchema = z.object({
  courseId: z.string().cuid(),
});

export const confirmQuestionMappingBatchSchema = z
  .object({
    selections: z
      .array(
        z
          .object({
            questionId: z.string().cuid(),
            conceptId: z.string().cuid(),
            publishedNodeId: z.string().cuid(),
            type: z.nativeEnum(QuestionGraphBindingType),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export type ConfirmQuestionMappingBatchData = z.output<
  typeof confirmQuestionMappingBatchSchema
>;
