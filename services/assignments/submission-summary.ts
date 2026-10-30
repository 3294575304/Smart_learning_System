import { GradingStatus, QuestionType, SubmissionStatus } from "@prisma/client";

export interface SummaryQuestion {
  id: string;
  type: QuestionType;
  points: number;
}
export interface SummaryAnswer {
  questionId: string;
  score: number | null;
  isCorrect: boolean | null;
  gradingStatus: GradingStatus;
  judgeStatus: string | null;
}

/** Use the frozen question set, including missing answer rows, as the denominator. */
export function summarizeSubmission(
  questions: SummaryQuestion[],
  answers: SummaryAnswer[],
  status: SubmissionStatus,
) {
  const byQuestion = new Map(
    answers.map((answer) => [answer.questionId, answer]),
  );
  const objective = questions.filter(
    (q) => q.type !== QuestionType.SHORT_ANSWER,
  );
  let score = 0;
  let judged = 0;
  let correct = 0;
  let pendingJudge = false;
  let judgeError = false;
  let pendingReview = false;
  for (const question of questions) {
    const answer = byQuestion.get(question.id);
    const programming = question.type === QuestionType.PYTHON_PROGRAMMING;
    if (programming) {
      judgeError ||= ["SYSTEM_ERROR", "CANCELLED"].includes(
        answer?.judgeStatus ?? "",
      );
      pendingJudge ||=
        !answer?.judgeStatus ||
        ["PENDING", "RUNNING"].includes(answer.judgeStatus);
    }
    const finalized =
      !!answer &&
      answer.score !== null &&
      (answer.gradingStatus === GradingStatus.AUTO_GRADED ||
        answer.gradingStatus === GradingStatus.GRADED) &&
      (!programming || answer.judgeStatus === "SUCCEEDED");
    if (!finalized && (!programming || answer?.judgeStatus === "SUCCEEDED"))
      pendingReview = true;
    if (question.type === QuestionType.SHORT_ANSWER || !finalized) continue;
    judged++;
    score += answer.score ?? 0;
    if (answer.isCorrect === true && answer.score === question.points)
      correct++;
  }
  const maxScore = objective.reduce((sum, q) => sum + q.points, 0);
  const complete = judged === objective.length;
  return {
    objectiveScore: score,
    objectiveMaxScore: maxScore,
    objectiveCount: objective.length,
    objectiveJudgedCount: judged,
    objectiveCorrectCount: correct,
    objectivePercentage:
      complete && maxScore > 0 ? (score / maxScore) * 100 : null,
    displayStatus: judgeError
      ? "判题异常"
      : pendingJudge
        ? "待判题"
        : pendingReview || status === SubmissionStatus.PENDING_REVIEW
          ? "待批改"
          : "已批改",
  };
}
