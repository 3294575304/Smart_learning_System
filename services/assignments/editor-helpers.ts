import {
  distributeEvenPoints,
  distributeEvenPointsByType,
  groupQuestionsByType,
} from "@/services/questions/score-distribution";

export { groupQuestionsByType };

/**
 * 全卷均分。实现已上移到 `services/questions/score-distribution`，
 * 这里保留原函数名，作业侧调用方无需改动。
 */
export function distributeAssignmentPoints(
  count: number,
  target: number,
): number[] {
  return distributeEvenPoints(count, target);
}

export function distributeAssignmentPointsByType(
  questions: readonly {
    type: string;
    programmingTotalPoints?: number | null;
  }[],
  target: number,
): number[] {
  if (questions.length === 0) return [];

  const targetCents = Math.round(target * 100);
  if (
    !Number.isFinite(target) ||
    target <= 0 ||
    target > 10_000 ||
    Math.abs(targetCents / 100 - target) > 1e-8 ||
    targetCents < questions.length
  )
    throw new Error("目标总分须精确到0.01分，且每题至少0.01分");

  const bigIndexes = questions.flatMap((question, index) =>
    question.type === "SHORT_ANSWER" || question.type === "PYTHON_PROGRAMMING"
      ? [index]
      : [],
  );
  const smallIndexes = questions.flatMap((question, index) =>
    question.type === "SHORT_ANSWER" || question.type === "PYTHON_PROGRAMMING"
      ? []
      : [index],
  );
  const bigCents =
    bigIndexes.length && smallIndexes.length
      ? Math.round(targetCents * 0.6)
      : bigIndexes.length
        ? targetCents
        : 0;
  const smallCents = targetCents - bigCents;
  const result = Array<number>(questions.length).fill(0);

  function assignGroup(
    indexes: number[],
    cents: number,
    preferInteger: boolean,
  ) {
    if (!indexes.length) return;
    if (cents < indexes.length)
      throw new Error("目标总分不足以为每道题分配至少0.01分");

    const wholePoints = Math.floor(cents / 100);
    const points =
      preferInteger && wholePoints >= indexes.length
        ? indexes.map(
            (_, index) =>
              Math.floor(wholePoints / indexes.length) +
              Number(index < wholePoints % indexes.length) +
              (index === 0 ? (cents % 100) / 100 : 0),
          )
        : distributeAssignmentPoints(indexes.length, cents / 100);

    indexes.forEach((questionIndex, index) => {
      result[questionIndex] = points[index];
    });
  }

  assignGroup(bigIndexes, bigCents, true);
  assignGroup(smallIndexes, smallCents, false);
  return result;
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

/**
 * 把目标总分平均分配给每个题型（题型数等分），题型内部再按题数均分。
 * 与「全卷均分」的区别：不看题目数量，每个题型拿到相同的小计。
 */
export function distributePointsEquallyByType<T extends string>(
  questions: readonly { id: string; type: T; points: number }[],
  target: number,
): number[] {
  return distributeEvenPointsByType(questions, target);
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
