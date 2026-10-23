export function distributeAssignmentPoints(
  count: number,
  target: number,
): number[] {
  const cents = Math.round(target * 100);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 200 ||
    !Number.isFinite(target) ||
    target > 10000 ||
    Math.abs(cents / 100 - target) > 1e-8 ||
    cents < count
  )
    throw new Error("目标总分须精确到0.01分，且每题至少0.01分");
  const base = Math.floor(cents / count);
  const remainder = cents % count;
  return Array.from(
    { length: count },
    (_, index) => (base + (index < remainder ? 1 : 0)) / 100,
  );
}

export function selectAssignmentQuestions<T extends { id: string }>(
  candidates: readonly T[],
  excludedIds: readonly string[],
  count: number,
  random: () => number = Math.random,
): T[] {
  if (!Number.isInteger(count) || count < 1 || count > 200)
    throw new Error("选题数量须为1至200的整数");
  const excluded = new Set(excludedIds);
  const available = [
    ...new Map(
      candidates
        .filter((item) => !excluded.has(item.id))
        .map((item) => [item.id, item]),
    ).values(),
  ];
  if (available.length < count)
    throw new Error(
      `当前条件仅有${available.length}道未选题，请减少数量或调整筛选`,
    );
  for (let index = available.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [available[index], available[target]] = [
      available[target],
      available[index],
    ];
  }
  return available.slice(0, count);
}
