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
