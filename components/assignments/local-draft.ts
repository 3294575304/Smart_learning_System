import { z } from "zod";
import type {
  AnswerableQuestion,
  QuestionAnswerState,
} from "./question-answer-input";

const answer = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("CHOICE"),
    optionIds: z.array(z.string()).max(100),
  }),
  z.object({ kind: z.literal("BOOLEAN"), value: z.boolean().nullable() }),
  z.object({ kind: z.literal("TEXT"), value: z.string().max(100_000) }),
  z.object({ kind: z.literal("CODE"), value: z.string().max(200_000) }),
]);
const localDraftSchema = z.object({
  answers: z.record(z.string(), answer),
  responseTimes: z
    .record(z.string(), z.number().int().min(0).max(86_400_000))
    .optional(),
  savedAt: z.number().finite().optional(),
});
export type AssignmentLocalDraft = {
  answers: Record<string, QuestionAnswerState>;
  responseTimes: Record<string, number>;
};

/** Only restore answers that belong to the current, frozen assignment questions. */
export function parseAssignmentLocalDraft(
  raw: string,
  questions: AnswerableQuestion[],
  accountAnswers: Record<string, QuestionAnswerState>,
): AssignmentLocalDraft | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = localDraftSchema.safeParse(value);
  if (!parsed.success) return null;
  const answers = { ...accountAnswers };
  const responseTimes: Record<string, number> = {};
  for (const question of questions) {
    const draft = parsed.data.answers[question.id];
    const current = accountAnswers[question.id];
    if (draft && current?.kind === draft.kind) {
      answers[question.id] =
        draft.kind === "CHOICE"
          ? {
              kind: "CHOICE",
              optionIds: [...new Set(draft.optionIds)].filter((id) =>
                question.options.some((option) => option.id === id),
              ),
            }
          : draft;
    }
    const time = parsed.data.responseTimes?.[question.id];
    if (time !== undefined) responseTimes[question.id] = time;
  }
  return { answers, responseTimes };
}
