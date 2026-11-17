import type { QuestionType } from "@prisma/client";
import {
  QUESTION_TYPE_ORDER_LABEL,
  isQuestionOrderOrganized,
  organizeQuestionsByType,
} from "@/services/questions/question-order";

export const ASSIGNMENT_QUESTION_ORDER_LABEL = QUESTION_TYPE_ORDER_LABEL;

/** Keep existing order within each type, including the teacher's manual adjustments. */
export function organizeAssignmentQuestions<T extends { type: QuestionType }>(
  questions: readonly T[],
): T[] {
  return organizeQuestionsByType(questions);
}

export function isAssignmentQuestionOrderOrganized(
  questions: ReadonlyArray<{ type: QuestionType }>,
): boolean {
  return isQuestionOrderOrganized(questions);
}
