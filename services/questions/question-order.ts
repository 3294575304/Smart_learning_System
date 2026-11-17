import type { QuestionType } from "@prisma/client";

/**
 * 题型的固定展示顺序：作业与考试共用同一套。
 * 放在 services/questions 下，避免考试侧依赖作业域。
 */
export const QUESTION_TYPE_ORDER: Record<QuestionType, number> = {
  SINGLE_CHOICE: 0,
  MULTIPLE_CHOICE: 1,
  TRUE_FALSE: 2,
  FILL_BLANK: 3,
  PYTHON_PROGRAMMING: 4,
  SHORT_ANSWER: 5,
};

export const QUESTION_TYPE_ORDER_LABEL =
  "单选 → 多选 → 判断 → 填空 → 编程 → 简答";

/**
 * 按题型稳定排序：同题型内保持原有相对顺序（含教师手工调整）。
 */
export function organizeQuestionsByType<T extends { type: QuestionType }>(
  questions: readonly T[],
): T[] {
  return questions
    .map((question, index) => ({ question, index }))
    .sort(
      (a, b) =>
        QUESTION_TYPE_ORDER[a.question.type] -
          QUESTION_TYPE_ORDER[b.question.type] || a.index - b.index,
    )
    .map(({ question }) => question);
}

export function isQuestionOrderOrganized(
  questions: ReadonlyArray<{ type: QuestionType }>,
): boolean {
  return questions.every(
    (question, index) =>
      index === 0 ||
      QUESTION_TYPE_ORDER[questions[index - 1].type] <=
        QUESTION_TYPE_ORDER[question.type],
  );
}
