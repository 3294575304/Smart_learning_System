import { z } from "zod";
import { recommendationIdSchema } from "@/services/recommendations/schemas";

const draftAnswerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("CHOICE"),
      optionIds: z.array(recommendationIdSchema).max(20),
    })
    .strict(),
  z
    .object({ kind: z.literal("BOOLEAN"), value: z.boolean().nullable() })
    .strict(),
  z.object({ kind: z.literal("TEXT"), value: z.string().max(10000) }).strict(),
  z.object({ kind: z.literal("CODE"), value: z.string().max(200000) }).strict(),
]);

const fields = {
  current: recommendationIdSchema,
  drafts: z
    .record(recommendationIdSchema, draftAnswerSchema)
    .refine((entries) => Object.keys(entries).length <= 100),
};

export const practiceDraftSnapshotSchema = z.object(fields).strict();
export const practiceDraftSaveSchema = z
  .object({
    ...fields,
    expectedRevision: z.number().int().min(0).max(2147483647),
  })
  .strict();

export interface PracticeAccountDraft {
  snapshot: z.output<typeof practiceDraftSnapshotSchema> | null;
  revision: number;
  savedAt: string | null;
}
