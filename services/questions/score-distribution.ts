/**
 * 通用的分值分配工具（作业与考试共用）。
 *
 * 只处理「把某个目标总分切成一组 0.01 精度的分值」，
 * 不涉及题型权重、锁定分值等业务规则；带业务规则的部分留在各自域内。
 */

/** 全卷均分：把目标总分平均分给 count 道题。 */
export function distributeEvenPoints(count: number, target: number): number[] {
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

/**
 * 按题型均分：每个题型拿到相同小计，题型内部再按题数均分。
 * 与「全卷均分」的区别：不看题目数量，每个题型拿到相同的小计。
 */
export function distributeEvenPointsByType<T extends string>(
  questions: readonly { id: string; type: T; points: number }[],
  target: number,
): number[] {
  const groups = groupQuestionsByType(questions);
  const types = [...groups.keys()];
  if (!types.length) return [];
  const targetCents = Math.round(target * 100);
  if (
    !Number.isFinite(target) ||
    target <= 0 ||
    target > 10_000 ||
    Math.abs(targetCents / 100 - target) > 1e-8
  )
    throw new Error("目标总分须在 0.01 至 10000 之间，并精确到 0.01 分");
  const base = Math.floor(targetCents / types.length);
  const remainder = targetCents % types.length;
  const subtotals = new Map<T, number>();
  types.forEach((type, index) => {
    subtotals.set(type, (base + (index < remainder ? 1 : 0)) / 100);
  });
  const allocated = new Map<string, number>();
  for (const [type, group] of groups) {
    const points = distributeEvenPoints(
      group.length,
      Math.round((subtotals.get(type) ?? 0) * 100) / 100,
    );
    group.forEach((question, index) =>
      allocated.set(question.id, points[index]),
    );
  }
  return questions.map(
    (question) => allocated.get(question.id) ?? question.points,
  );
}
