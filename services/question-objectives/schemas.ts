import { z } from "zod";

export const QUESTION_OBJECTIVE_JOB_TYPE = "QUESTION_OBJECTIVE_CLASSIFY";
export const QUESTION_OBJECTIVE_PROMPT_VERSION = "question-objective-v1";

export const questionObjectiveJobInputSchema = z
  .object({
    questionId: z.string().cuid(),
    revision: z.number().int().positive(),
    courseId: z.string().cuid().nullable(),
    syllabusStructureId: z.string().cuid().nullable(),
  })
  .refine(
    (value) => Boolean(value.courseId) === Boolean(value.syllabusStructureId),
  );

export const questionObjectiveAIOutputSchema = z
  .object({
    objectiveCode: z.string().trim().min(1).max(50),
    confidence: z.number().min(0).max(1).nullable(),
    reason: z.string().trim().max(300),
  })
  .strict();

export function parseQuestionObjectiveSuggestion(
  raw: unknown,
  allowedCodes: string[],
) {
  const output = questionObjectiveAIOutputSchema.parse(raw);
  if (!allowedCodes.includes(output.objectiveCode))
    throw new Error("AI_OBJECTIVE_OUT_OF_SCOPE");
  return output;
}

export type QuestionObjectiveAIInput = {
  title: string;
  content: string;
  type: string;
  options: Array<{ content: string }>;
  objectives: Array<{ code: string; title: string; description: string }>;
};
