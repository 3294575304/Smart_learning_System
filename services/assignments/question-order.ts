import type { QuestionType } from "@prisma/client";

const QUESTION_ORDER: Record<QuestionType, number> = {
  SINGLE_CHOICE: 0,
  MULTIPLE_CHOICE: 1,
  TRUE_FALSE: 2,
  FILL_BLANK: 3,
  PYTHON_PROGRAMMING: 4,
  SHORT_ANSWER: 5,
};

export const ASSIGNMENT_QUESTION_ORDER_LABEL =
  "单选 → 多选 → 判断 → 填空 → 编程 → 简答";

/** Keep existing order within each type, including the teacher's manual adjustments. */
export function organizeAssignmentQuestions<T extends { type: QuestionType }>(
  questions: readonly T[],
): T[] {
  return questions
    .map((question, index) => ({ question, index }))
    .sort(
      (a, b) =>
        QUESTION_ORDER[a.question.type] - QUESTION_ORDER[b.question.type] ||
        a.index - b.index,
    )
    .map(({ question }) => question);
}

export function isAssignmentQuestionOrderOrganized(
  questions: ReadonlyArray<{ type: QuestionType }>,
): boolean {
  return questions.every(
    (question, index) =>
      index === 0 ||
      QUESTION_ORDER[questions[index - 1].type] <=
        QUESTION_ORDER[question.type],
  );
}
