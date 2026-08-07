import { OutcomeStudentStatus, Prisma } from "@prisma/client";

export const OUTCOME_ATTAINMENT_RULE_VERSION = "course-outcome-attainment-v1";
export interface ComponentScore {
  componentId: string;
  status: "COMPLETE" | "INCOMPLETE" | "EXEMPT";
  score: string | null;
}
export interface Mapping {
  componentId: string;
  componentWeight: Prisma.Decimal;
  allocationRate: Prisma.Decimal;
}

export function calculateStudentOutcome(
  componentScores: ComponentScore[],
  mappings: Mapping[],
  threshold: Prisma.Decimal,
) {
  const byId = new Map(componentScores.map((item) => [item.componentId, item]));
  const evidence = mappings.map((mapping) => ({
    mapping,
    component: byId.get(mapping.componentId) ?? null,
  }));
  if (
    evidence.some(
      (item) => !item.component || item.component.status === "INCOMPLETE",
    )
  )
    return {
      status: OutcomeStudentStatus.EXCLUDED_MISSING,
      score: null,
      attained: null,
      evidence,
    };
  const included = evidence.filter(
    (item) =>
      item.component?.status === "COMPLETE" && item.component.score !== null,
  );
  if (!included.length)
    return {
      status: OutcomeStudentStatus.EXCLUDED_EXEMPT,
      score: null,
      attained: null,
      evidence,
    };
  const weights = included.map((item) =>
    item.mapping.componentWeight.mul(item.mapping.allocationRate).div(100),
  );
  const denominator = weights.reduce(
    (sum, value) => sum.add(value),
    new Prisma.Decimal(0),
  );
  if (denominator.isZero())
    return {
      status: OutcomeStudentStatus.EXCLUDED_MISSING,
      score: null,
      attained: null,
      evidence,
    };
  const numerator = included.reduce(
    (sum, item, index) =>
      sum.add(new Prisma.Decimal(item.component!.score!).mul(weights[index]!)),
    new Prisma.Decimal(0),
  );
  const score = numerator
    .div(denominator)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  return {
    status: OutcomeStudentStatus.INCLUDED,
    score,
    attained: score.greaterThanOrEqualTo(threshold),
    evidence,
  };
}

export function calculateClassOutcome(
  scores: Prisma.Decimal[],
  threshold: Prisma.Decimal,
) {
  if (!scores.length)
    return { meanScore: null, attainmentIndex: null, attained: null };
  const meanScore = scores
    .reduce((sum, value) => sum.add(value), new Prisma.Decimal(0))
    .div(scores.length)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  return {
    meanScore,
    attainmentIndex: meanScore
      .div(threshold)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
    attained: meanScore.greaterThanOrEqualTo(threshold),
  };
}
