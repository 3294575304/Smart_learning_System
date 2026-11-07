import type { TeacherSubmissionAnswerView } from "./types";

export type AnswerOutcome =
  | "CORRECT"
  | "WRONG"
  | "PARTIAL"
  | "PENDING_REVIEW"
  | "PENDING_JUDGE"
  | "JUDGE_ERROR"
  | "MISSING";
export const outcomeLabels: Record<AnswerOutcome, string> = {
  CORRECT: "回答正确",
  WRONG: "回答错误",
  PARTIAL: "部分得分",
  PENDING_REVIEW: "待批改",
  PENDING_JUDGE: "待判题",
  JUDGE_ERROR: "判题异常",
  MISSING: "缺少作答记录",
};
export function answerOutcome(
  answer: TeacherSubmissionAnswerView | null,
): AnswerOutcome {
  if (!answer) return "MISSING";
  if (answer.type === "PYTHON_PROGRAMMING") {
    const state = answer.programmingAttempt?.status;
    if (state === "SYSTEM_ERROR" || state === "CANCELLED") return "JUDGE_ERROR";
    if (state !== "SUCCEEDED") return "PENDING_JUDGE";
  }
  if (
    !["AUTO_GRADED", "GRADED"].includes(answer.gradingStatus) ||
    answer.finalScore === null
  )
    return "PENDING_REVIEW";
  if (answer.isCorrect === true && answer.finalScore === answer.maxScore)
    return "CORRECT";
  if (answer.finalScore > 0 && answer.finalScore < answer.maxScore)
    return "PARTIAL";
  return "WRONG";
}
