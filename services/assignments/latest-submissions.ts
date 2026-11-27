/** Latest submitted attempt only; drafts and withdrawals do not supersede valid work. */
export function latestEffectiveSubmissions<
  T extends {
    id: string;
    studentId: string;
    attemptNumber: number;
    submittedAt: Date | null;
    status: string;
  },
>(submissions: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const item of submissions) {
    if (
      !["SUBMITTED", "PENDING_REVIEW", "GRADED", "PUBLISHED"].includes(
        item.status,
      )
    )
      continue;
    const previous = latest.get(item.studentId);
    const time = item.submittedAt?.getTime() ?? 0;
    const oldTime = previous?.submittedAt?.getTime() ?? 0;
    if (
      !previous ||
      item.attemptNumber > previous.attemptNumber ||
      (item.attemptNumber === previous.attemptNumber &&
        (time > oldTime || (time === oldTime && item.id > previous.id)))
    )
      latest.set(item.studentId, item);
  }
  return [...latest.values()];
}

export function submissionNeedsGrading(submission: {
  status: string;
  score: unknown;
  maxScore: unknown;
  gradedAt: Date | null;
  _count: { answers: number };
}) {
  return (
    submission.status === "SUBMITTED" ||
    submission.status === "PENDING_REVIEW" ||
    submission._count.answers > 0 ||
    (submission.status === "GRADED" &&
      (submission.score === null ||
        submission.maxScore === null ||
        submission.gradedAt === null))
  );
}
