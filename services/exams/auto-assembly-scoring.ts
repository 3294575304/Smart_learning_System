import type { QuestionType } from "@prisma/client";
import {
  distributeEvenPoints,
  groupQuestionsByType,
} from "@/services/questions/score-distribution";

export const AUTO_EXAM_TOTAL_POINTS = 100;
export type ExamTypeSubtotals = Partial<Record<QuestionType, number>>;

export const DEFAULT_EXAM_TYPE_WEIGHTS: Record<QuestionType, number> = {
  SINGLE_CHOICE: 2,
  MULTIPLE_CHOICE: 4,
  TRUE_FALSE: 2,
  FILL_BLANK: 3,
  SHORT_ANSWER: 10,
  PYTHON_PROGRAMMING: 20,
};

/**
 * 按题型权重把 `target` 分（默认 100）分配到每道题。
 * 余数按「小数部分最大、同值按原序」逐分补齐，保证合计精确等于 target。
 */
export function distributeExamPoints<T extends { type: QuestionType }>(
  questions: T[],
  weights: Record<QuestionType, number>,
  target = AUTO_EXAM_TOTAL_POINTS,
): Array<T & { points: number }> {
  if (!questions.length) return [];
  const totalCents = Math.round(target * 100);
  if (!Number.isFinite(target) || totalCents <= 0)
    throw new Error("目标总分必须大于零");
  const totalWeight = questions.reduce(
    (sum, item) => sum + weights[item.type],
    0,
  );
  if (totalWeight <= 0) throw new Error("题型权重总和必须大于零");
  const raw = questions.map((item, index) => {
    const exact = (totalCents * weights[item.type]) / totalWeight;
    return {
      item,
      index,
      cents: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let remaining = totalCents - raw.reduce((sum, item) => sum + item.cents, 0);
  for (const item of [...raw].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  )) {
    if (remaining <= 0) break;
    item.cents += 1;
    remaining -= 1;
  }
  return raw.map(({ item, cents }) => ({ ...item, points: cents / 100 }));
}

export function sumExamPointsByType(
  questions: readonly { type: QuestionType; points: number }[],
): ExamTypeSubtotals {
  return Object.fromEntries(
    [...groupQuestionsByType(questions)].map(([type, group]) => [
      type,
      group.reduce(
        (sum, question) => sum + Math.round(question.points * 100),
        0,
      ) / 100,
    ]),
  );
}

export function applyExamTypeSubtotals<
  T extends { type: QuestionType; points: number },
>(questions: T[], subtotals: ExamTypeSubtotals): T[] {
  const scores = new Map<T, number>();
  for (const [type, group] of groupQuestionsByType(questions)) {
    const subtotal = subtotals[type] ?? 0;
    // A new type or an insufficient subtotal stays unscored until the teacher reallocates it.
    if (group.length > 200 || Math.round(subtotal * 100) < group.length)
      continue;
    const points = distributeEvenPoints(group.length, subtotal);
    group.forEach((question, index) => scores.set(question, points[index]));
  }
  return questions.map((question) => ({
    ...question,
    points: scores.get(question) ?? 0,
  }));
}
