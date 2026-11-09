import type { QuestionType } from "@prisma/client";

export const DEFAULT_EXAM_TYPE_WEIGHTS: Record<QuestionType, number> = {
  SINGLE_CHOICE: 2,
  MULTIPLE_CHOICE: 4,
  TRUE_FALSE: 2,
  FILL_BLANK: 3,
  SHORT_ANSWER: 10,
  PYTHON_PROGRAMMING: 20,
};

export function distributeExamPoints<T extends { type: QuestionType }>(
  questions: T[],
  weights: Record<QuestionType, number>,
): Array<T & { points: number }> {
  if (!questions.length) return [];
  const totalWeight = questions.reduce(
    (sum, item) => sum + weights[item.type],
    0,
  );
  if (totalWeight <= 0) throw new Error("题型权重总和必须大于零");
  const raw = questions.map((item, index) => {
    const exact = (10000 * weights[item.type]) / totalWeight;
    return {
      item,
      index,
      cents: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let remaining = 10000 - raw.reduce((sum, item) => sum + item.cents, 0);
  for (const item of [...raw].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  )) {
    if (remaining <= 0) break;
    item.cents += 1;
    remaining -= 1;
  }
  return raw.map(({ item, cents }) => ({ ...item, points: cents / 100 }));
}
