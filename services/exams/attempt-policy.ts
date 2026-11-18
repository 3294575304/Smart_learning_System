import type { SubmissionStatus } from "@prisma/client";

export const maxExamAttempts = 20;

export function examAttemptAvailability(
  allowedAttempts: number,
  attempts: readonly { status: SubmissionStatus }[],
) {
  const usedAttempts = attempts.filter(
    ({ status }) => status !== "IN_PROGRESS" && status !== "WITHDRAWN",
  ).length;
  return {
    remainingAttempts: Math.max(0, allowedAttempts - usedAttempts),
    hasInProgress: attempts.some(({ status }) => status === "IN_PROGRESS"),
  };
}
