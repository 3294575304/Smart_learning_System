import { ProgrammingJudgeErrorType } from "@prisma/client";

// Execution points remain immutable; a recoverable code error requires an explained teacher review.
export function needsProgrammingScoreReview(
  error: ProgrammingJudgeErrorType | null,
  score: number,
  maxScore: number,
  code: string,
): boolean {
  return (
    code.trim().length > 0 &&
    score < maxScore &&
    (error === ProgrammingJudgeErrorType.SYNTAX_ERROR ||
      error === ProgrammingJudgeErrorType.RUNTIME_ERROR)
  );
}
