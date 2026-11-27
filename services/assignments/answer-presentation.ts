import { QuestionType, type GradingStatus } from "@prisma/client";

export type PublishedReceiptOutcome =
  "CORRECT" | "INCORRECT" | "PARTIAL" | "PENDING";

export function publishedReceiptOutcome(answer?: {
  score: number | null;
  maxScore: number;
  gradingStatus: GradingStatus;
}): PublishedReceiptOutcome {
  if (
    !answer ||
    answer.score === null ||
    (answer.gradingStatus !== "GRADED" &&
      answer.gradingStatus !== "AUTO_GRADED")
  )
    return "PENDING";
  if (answer.score === 0) return "INCORRECT";
  return answer.score >= answer.maxScore ? "CORRECT" : "PARTIAL";
}

export function hasRecordedStudentAnswer(
  answer: { booleanAnswer: boolean | null; textAnswer: string | null },
  selectedOptionCount: number,
) {
  return (
    answer.booleanAnswer !== null ||
    selectedOptionCount > 0 ||
    Boolean(answer.textAnswer?.trim())
  );
}

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

export function hasStudentAnswer(
  answer: PresentedAnswer,
  type: QuestionType,
): boolean {
  if (
    type === QuestionType.SINGLE_CHOICE ||
    type === QuestionType.MULTIPLE_CHOICE
  )
    return answer.selectedOptions.length > 0;
  if (type === QuestionType.TRUE_FALSE) return answer.booleanAnswer !== null;
  return Boolean(answer.textAnswer?.trim());
}

export function formatCorrectAnswer(question: PresentedQuestion): string {
  if (question.typeSnapshot === QuestionType.PYTHON_PROGRAMMING) {
    return "由作业发布时冻结的测试用例判定";
  }
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
