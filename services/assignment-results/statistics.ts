import type { QuestionAccuracy } from "@/services/assignment-results/types";

export function calculateAccuracy(
  correctValue: number,
  judgedValue: number,
): number | null {
  if (judgedValue <= 0) return null;
  return Math.round((correctValue / judgedValue) * 10000) / 100;
}

export function selectFrequentWrongQuestions(
  questions: readonly QuestionAccuracy[],
  limit = 5,
): QuestionAccuracy[] {
  return [...questions]
    .filter((question) => question.wrongCount > 0)
    .sort(
      (left, right) =>
        right.wrongCount - left.wrongCount ||
        (left.accuracy ?? 100) - (right.accuracy ?? 100) ||
        left.sortOrder - right.sortOrder,
    )
    .slice(0, Math.max(0, limit));
}
