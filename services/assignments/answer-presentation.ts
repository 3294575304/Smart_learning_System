import { QuestionType } from "@prisma/client";

interface PresentedOption {
  labelSnapshot: string;
  contentSnapshot: string;
}

interface PresentedAnswer {
  textAnswer: string | null;
  booleanAnswer: boolean | null;
  selectedOptions: Array<{
    assignmentQuestionOption: PresentedOption;
  }>;
}

interface PresentedQuestion {
  typeSnapshot: QuestionType;
  correctBooleanSnapshot: boolean | null;
  referenceAnswerSnapshot: string | null;
  acceptableAnswersSnapshot: string[];
  optionSnapshots: Array<
    PresentedOption & {
      isCorrectSnapshot: boolean;
    }
  >;
}

function formatOptions(options: PresentedOption[]): string {
  if (options.length === 0) return "未作答";
  return options
    .map((option) => `${option.labelSnapshot}. ${option.contentSnapshot}`)
    .join("；");
}

export function formatStudentAnswer(
  answer: PresentedAnswer,
  questionType: QuestionType,
): string {
  if (
    questionType === QuestionType.SINGLE_CHOICE ||
    questionType === QuestionType.MULTIPLE_CHOICE
  ) {
    return formatOptions(
      answer.selectedOptions.map(
        (selection) => selection.assignmentQuestionOption,
      ),
    );
  }
  if (questionType === QuestionType.TRUE_FALSE) {
    if (answer.booleanAnswer === null) return "未作答";
    return answer.booleanAnswer ? "正确" : "错误";
  }
  return answer.textAnswer?.trim() || "未作答";
}

export function formatCorrectAnswer(question: PresentedQuestion): string {
  if (
    question.typeSnapshot === QuestionType.SINGLE_CHOICE ||
    question.typeSnapshot === QuestionType.MULTIPLE_CHOICE
  ) {
    return formatOptions(
      question.optionSnapshots.filter((option) => option.isCorrectSnapshot),
    );
  }
  if (question.typeSnapshot === QuestionType.TRUE_FALSE) {
    if (question.correctBooleanSnapshot === null) return "未设置";
    return question.correctBooleanSnapshot ? "正确" : "错误";
  }
  if (question.typeSnapshot === QuestionType.FILL_BLANK) {
    return question.acceptableAnswersSnapshot.length > 0
      ? question.acceptableAnswersSnapshot.join("；")
      : "未设置";
  }
  return question.referenceAnswerSnapshot?.trim() || "未设置参考答案";
}
