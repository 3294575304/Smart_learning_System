import { QuestionType } from "@prisma/client";
import type { QuestionUpsertData } from "./schemas";

export type QuestionAnswerDraft = Pick<
  QuestionUpsertData,
  "options" | "answer"
>;

export function defaultAnswerDraft(type: QuestionType): QuestionAnswerDraft {
  if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE")
    return {
      options: ["A", "B", "C", "D"].map((label, index) => ({
        label,
        content: "",
        sortOrder: index + 1,
      })),
      answer: { kind: "CHOICE", correctOptionLabels: [] },
    };
  if (type === "TRUE_FALSE")
    return { options: [], answer: { kind: "BOOLEAN", value: true } };
  if (type === "FILL_BLANK")
    return {
      options: [],
      answer: { kind: "TEXT", acceptableAnswers: [""], caseSensitive: false },
    };
  if (type === "PYTHON_PROGRAMMING")
    return { options: [], answer: { kind: "PROGRAMMING" } };
  return { options: [], answer: { kind: "REFERENCE", value: "" } };
}

/** 按原选项身份保留答案，再重新编号，避免删除 B 后原 C 的答案指向其他内容。 */
export function removeChoiceOption(
  draft: QuestionAnswerDraft,
  index: number,
): QuestionAnswerDraft {
  if (draft.answer.kind !== "CHOICE" || draft.options.length <= 2) return draft;
  const correct = new Set(draft.answer.correctOptionLabels);
  const remaining = draft.options.filter((_, i) => i !== index);
  return {
    options: remaining.map((option, i) => ({
      ...option,
      label: String.fromCharCode(65 + i),
      sortOrder: i + 1,
    })),
    answer: {
      kind: "CHOICE",
      correctOptionLabels: remaining.flatMap((option, i) =>
        correct.has(option.label) ? [String.fromCharCode(65 + i)] : [],
      ),
    },
  };
}

export function questionValidationMessages(errors: unknown): string[] {
  const messages = new Set<string>();
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string") messages.add(record.message);
    for (const [key, child] of Object.entries(record))
      if (key !== "ref" && key !== "message") visit(child);
  }
  visit(errors);
  return [...messages];
}
