import { QuestionType } from "@prisma/client";
import { z } from "zod";
import { assignmentUpsertSchema } from "./schemas";

const ids = (max: number) =>
  z
    .array(z.string().cuid())
    .max(max)
    .refine((values) => new Set(values).size === values.length, "不可重复选择");
const classroomIds = ids(20).refine(
  (values) => values.length > 0,
  "请至少选择一个班级",
);
export const editorAssistanceSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("ASSEMBLE"),
      classroomIds,
      conceptIds: ids(200).refine(
        (values) => values.length > 0,
        "请至少选择一个知识点",
      ),
      types: z.array(z.nativeEnum(QuestionType)).max(6),
      count: z.number().int().min(1).max(30),
      excludedIds: ids(200),
    })
    .strict(),
  z
    .object({
      action: z.literal("PREFLIGHT"),
      classroomIds,
      assignmentId: z.string().cuid().optional(),
      assignment: assignmentUpsertSchema,
    })
    .strict(),
]);
export type EditorAssistanceInput = z.output<typeof editorAssistanceSchema>;
export interface AssemblyProviderInput {
  count: number;
  candidates: Array<{
    key: number;
    title: string;
    type: string;
    concepts: string[];
    recent: boolean;
  }>;
}
export const assemblyOutputSchema = z
  .object({
    picks: z
      .array(
        z
          .object({
            key: z.number().int().positive(),
            reason: z.string().trim().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export type AssignmentAssemblyReview = {
  source: "AI" | "RULES";
  questions: Array<{
    id: string;
    title: string;
    type: QuestionType;
    conceptNames: string[];
    reason: string;
    lastUsedAt: string | null;
    recentClassrooms: string[];
  }>;
  alternatives: AssignmentAssemblyReview["questions"];
  missingConceptNames: string[];
  requested: number;
};
export type AssignmentPublicationPreview = {
  classrooms: Array<{
    id: string;
    name: string;
    sameTitleCount: number;
    recentQuestionCount: number;
  }>;
  totalPoints: number;
  resourceCount: number;
};
