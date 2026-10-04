import type { QuestionType } from "@prisma/client";

export type PracticeDraft =
  | { kind: "CHOICE"; optionIds: string[] }
  | { kind: "BOOLEAN"; value: boolean | null }
  | { kind: "TEXT" | "CODE"; value: string };

export function practiceAnswerRequired(type: QuestionType): boolean {
  return ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(type);
}

export function practiceDraftFilled(answer?: PracticeDraft): boolean {
  if (!answer) return false;
  if (answer.kind === "CHOICE") return answer.optionIds.length > 0;
  if (answer.kind === "BOOLEAN") return answer.value !== null;
  return Boolean(answer.value.trim());
}

export function missingPracticeAnswers(
  questions: Array<{ id: string; type: QuestionType; status: string }>,
  drafts: Record<string, PracticeDraft>,
): string[] {
  return questions
    .filter(
      (q) =>
        q.status !== "COMPLETED" &&
        practiceAnswerRequired(q.type) &&
        !practiceDraftFilled(drafts[q.id]),
    )
    .map((q) => q.id);
}
