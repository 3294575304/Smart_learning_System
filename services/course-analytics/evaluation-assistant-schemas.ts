import { z } from "zod";
import { classroomIdSchema } from "@/services/courses/schemas";

const intent = z.enum([
  "GRADEBOOK",
  "QUALITY_REPORT",
  "BOTH",
  "ASSIGNMENT_ASSEMBLY",
  "QUESTION_GENERATION",
]);
export type EvaluationIntent = z.infer<typeof intent>;

export const evaluationIntentOutputSchema = z
  .object({
    intent: intent.nullable(),
  })
  .strict();

export const evaluationAssistantRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("plan"),
      text: z.string().trim().min(1).max(240),
      classroomId: classroomIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("select"),
      intent,
      classroomId: classroomIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("confirm"),
      intent,
      classroomId: classroomIdSchema.optional(),
      revision: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict(),
]);

export type EvaluationAssistantRequest = z.infer<
  typeof evaluationAssistantRequestSchema
>;
export type EvaluationAssistantResult =
  | { status: "MANUAL"; message: string }
  | {
      status: "CHOOSE_CLASSROOM";
      intent: EvaluationIntent;
      classrooms: Array<{ id: string; name: string }>;
    }
  | {
      status: "REVIEW";
      intent: EvaluationIntent;
      courseName: string;
      classroom: { id: string; name: string } | null;
      publicationVersion: number | null;
      detail: string;
      label: string;
      revision: string;
    }
  | { status: "CONFIRMED"; href: string };
