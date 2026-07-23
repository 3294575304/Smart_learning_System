import { GradingStatus, QuestionType } from "@prisma/client";

import type { SavedAnswerInput } from "@/services/assignments/schemas";

export interface GradingQuestion {
  type: QuestionType;
  points: number;
  correctBoolean: boolean | null;
  acceptableAnswers: string[];
  isCaseSensitive: boolean;
  options: Array<{ id: string; isCorrect: boolean }>;
}

export interface GradingResult {
  gradingStatus: GradingStatus;
  score: number | null;
  isCorrect: boolean | null;
}

export const AUTO_GRADABLE_QUESTION_TYPES: QuestionType[] = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.FILL_BLANK,
];

export function isAutoGradableQuestionType(type: QuestionType): boolean {
  return AUTO_GRADABLE_QUESTION_TYPES.includes(type);
}

export interface StoredGradingAnswer {
  textAnswer: string | null;
  booleanAnswer: boolean | null;
  selectedOptions: Array<{ assignmentQuestionOptionId: string }>;
}

export function savedAnswerInput(
  question: { id: string; type: QuestionType },
  answer: StoredGradingAnswer | undefined,
): SavedAnswerInput {
  if (!answer) return { assignmentQuestionId: question.id, kind: "EMPTY" };
  if (
    question.type === QuestionType.SINGLE_CHOICE ||
    question.type === QuestionType.MULTIPLE_CHOICE
  ) {
    return {
      assignmentQuestionId: question.id,
      kind: "CHOICE",
      optionIds: answer.selectedOptions.map(
        (selection) => selection.assignmentQuestionOptionId,
      ),
    };
  }
  if (question.type === QuestionType.TRUE_FALSE) {
    return answer.booleanAnswer === null
      ? { assignmentQuestionId: question.id, kind: "EMPTY" }
      : {
          assignmentQuestionId: question.id,
          kind: "BOOLEAN",
          value: answer.booleanAnswer,
        };
  }
  return answer.textAnswer === null
    ? { assignmentQuestionId: question.id, kind: "EMPTY" }
    : {
        assignmentQuestionId: question.id,
        kind: "TEXT",
        value: answer.textAnswer,
      };
}

export function normalizeFillBlank(
  value: string,
  caseSensitive: boolean,
): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return caseSensitive ? normalized : normalized.toLocaleLowerCase();
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

export function gradeAnswer(
  question: GradingQuestion,
  answer: SavedAnswerInput,
): GradingResult {
  if (question.type === QuestionType.SHORT_ANSWER) {
    return {
      gradingStatus: GradingStatus.MANUAL_REVIEW_REQUIRED,
      score: null,
      isCorrect: null,
    };
  }

  let isCorrect = false;
  if (
    (question.type === QuestionType.SINGLE_CHOICE ||
      question.type === QuestionType.MULTIPLE_CHOICE) &&
    answer.kind === "CHOICE"
  ) {
    const correctIds = question.options
      .filter((option) => option.isCorrect)
      .map((option) => option.id);
    isCorrect = sameSet(answer.optionIds, correctIds);
  } else if (
    question.type === QuestionType.TRUE_FALSE &&
    answer.kind === "BOOLEAN"
  ) {
    isCorrect = answer.value === question.correctBoolean;
  } else if (
    question.type === QuestionType.FILL_BLANK &&
    answer.kind === "TEXT"
  ) {
    const actual = normalizeFillBlank(answer.value, question.isCaseSensitive);
    isCorrect = question.acceptableAnswers.some(
      (acceptable) =>
        normalizeFillBlank(acceptable, question.isCaseSensitive) === actual,
    );
  }

  return {
    gradingStatus: GradingStatus.AUTO_GRADED,
    score: isCorrect ? question.points : 0,
    isCorrect,
  };
}
