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

export function groupQuestionsByType<T extends { type: string }>(
  questions: readonly T[],
) {
  const groups = new Map<T["type"], T[]>();
  for (const question of questions) {
    const group = groups.get(question.type);
    if (group) group.push(question);
    else groups.set(question.type, [question]);
  }
  return groups;
}

export function distributePointsByType<T extends string>(
  questions: readonly { id: string; type: T; points: number }[],
  target: number,
  subtotals: Partial<Record<T, number>>,
  lockedIds: readonly string[],
) {
  const cents = (value: number) => {
    const amount = Math.round(value * 100);
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      value > 10_000 ||
      Math.abs(amount / 100 - value) > 1e-8
    )
      throw new Error("分值须在 0.01 至 10000 之间，并精确到 0.01 分");
    return amount;
  };
  const targetCents = cents(target);
  const locked = new Set(lockedIds);
  const groups = groupQuestionsByType(questions);
  const totals = [...groups.keys()].map((type) =>
    cents(subtotals[type] ?? NaN),
  );
  if (totals.reduce((sum, value) => sum + value, 0) !== targetCents)
    throw new Error("各题型小计必须等于目标总分");
  const allocated = new Map<string, number>();
  for (const [type, group] of groups) {
    const fixed = group.filter((q) => locked.has(q.id));
    const adjustable = group.filter((q) => !locked.has(q.id));
    const remaining =
      cents(subtotals[type] ?? NaN) -
      fixed.reduce((sum, q) => sum + cents(q.points), 0);
    if (
      remaining < adjustable.length ||
      (!adjustable.length && remaining !== 0)
    )
      throw new Error("题型小计无法满足已锁定分值和每道题至少 0.01 分的要求");
    if (adjustable.length)
      distributeAssignmentPoints(adjustable.length, remaining / 100).forEach(
        (points, index) => allocated.set(adjustable[index].id, points),
      );
  }
  return questions.map((q) => allocated.get(q.id) ?? q.points);
}
