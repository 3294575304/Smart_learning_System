import { CourseConceptMasteryLevel, Prisma } from "@prisma/client";

import { CONCEPT_MASTERY_SCORE_SCALE } from "@/services/concept-mastery/constants";

export interface EffectiveConceptEvidence {
  id: string;
  studentAnswerId: string;
  conceptId: string;
  score: Prisma.Decimal;
  maxScore: Prisma.Decimal;
  gradedAt: Date;
}

export interface ConceptMasteryAggregate {
  conceptId: string;
  evidenceCount: number;
  distinctAnswerCount: number;
  earnedPoints: Prisma.Decimal;
  availablePoints: Prisma.Decimal;
  masteryScore: Prisma.Decimal;
  level: CourseConceptMasteryLevel;
  firstEvidenceAt: Date;
  lastEvidenceAt: Date;
}

export function courseConceptMasteryLevel(
  score: Prisma.Decimal,
): CourseConceptMasteryLevel {
  if (score.lt(50)) return CourseConceptMasteryLevel.NEEDS_SUPPORT;
  if (score.lt(80)) return CourseConceptMasteryLevel.DEVELOPING;
  return CourseConceptMasteryLevel.MASTERED;
}

export function calculateConceptMastery(
  evidence: readonly EffectiveConceptEvidence[],
): ConceptMasteryAggregate[] {
  const grouped = new Map<string, EffectiveConceptEvidence[]>();
  for (const item of evidence) {
    const current = grouped.get(item.conceptId) ?? [];
    current.push(item);
    grouped.set(item.conceptId, current);
  }

  return [...grouped]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([conceptId, items]) => {
      const usable = items.filter(
        (item) =>
          item.maxScore.gt(0) &&
          item.score.gte(0) &&
          item.score.lte(item.maxScore),
      );
      if (usable.length === 0) return [];
      const earnedPoints = usable.reduce(
        (sum, item) => sum.add(item.score),
        new Prisma.Decimal(0),
      );
      const availablePoints = usable.reduce(
        (sum, item) => sum.add(item.maxScore),
        new Prisma.Decimal(0),
      );
      if (availablePoints.lte(0)) return [];
      const masteryScore = Prisma.Decimal.max(
        0,
        Prisma.Decimal.min(
          100,
          earnedPoints
            .div(availablePoints)
            .mul(100)
            .toDecimalPlaces(CONCEPT_MASTERY_SCORE_SCALE),
        ),
      );
      const times = usable.map((item) => item.gradedAt.getTime());
      return [
        {
          conceptId,
          evidenceCount: usable.length,
          distinctAnswerCount: new Set(
            usable.map((item) => item.studentAnswerId),
          ).size,
          earnedPoints,
          availablePoints,
          masteryScore,
          level: courseConceptMasteryLevel(masteryScore),
          firstEvidenceAt: new Date(Math.min(...times)),
          lastEvidenceAt: new Date(Math.max(...times)),
        },
      ];
    });
}
