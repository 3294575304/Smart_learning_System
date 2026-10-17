export function currentPracticeProgress<T extends { graphVersionId: string }>(
  graphVersionId: string,
  progress: T | null | undefined,
): T | null {
  return progress?.graphVersionId === graphVersionId ? progress : null;
}

export function requiresCompletePracticePaper(
  mode: "PRACTICE" | "TEST" | undefined,
) {
  return mode === "TEST";
}
