import { MasteryLevel, MasteryTrend, Prisma } from "@prisma/client";

export interface MasteryUpdatePreview {
  answeredCount: number;
  correctCount: number;
  earnedPoints: Prisma.Decimal;
  availablePoints: Prisma.Decimal;
  masteryScore: Prisma.Decimal;
  level: MasteryLevel;
  trend: MasteryTrend;
}

export function masteryLevelFor(
  masteryScore: number,
  answeredCount: number,
): MasteryLevel {
  if (answeredCount === 0) return MasteryLevel.NOT_STARTED;
  if (masteryScore < 40) return MasteryLevel.BEGINNER;
  if (masteryScore < 60) return MasteryLevel.DEVELOPING;
  if (masteryScore < 80) return MasteryLevel.PROFICIENT;
  return MasteryLevel.MASTERED;
}

export function calculateMasteryUpdate(
  current: {
    answeredCount: number;
    correctCount: number;
    earnedPoints: Prisma.Decimal;
    availablePoints: Prisma.Decimal;
    masteryScore: Prisma.Decimal;
  } | null,
  weight: Prisma.Decimal,
  isCorrect: boolean,
): MasteryUpdatePreview {
  const answeredCount = (current?.answeredCount ?? 0) + 1;
  const correctCount = (current?.correctCount ?? 0) + (isCorrect ? 1 : 0);
  const storedAvailablePoints =
    current?.availablePoints ?? new Prisma.Decimal(0);
  const baseAvailablePoints = storedAvailablePoints.gt(0)
    ? storedAvailablePoints
    : new Prisma.Decimal(current?.answeredCount ?? 0);
  const baseEarnedPoints = storedAvailablePoints.gt(0)
    ? (current?.earnedPoints ?? new Prisma.Decimal(0))
    : baseAvailablePoints
        .mul(current?.masteryScore ?? new Prisma.Decimal(0))
        .div(100);
  const earnedPoints = baseEarnedPoints.add(isCorrect ? weight : 0);
  const availablePoints = baseAvailablePoints.add(weight);
  const rawScore = availablePoints.gt(0)
    ? earnedPoints.div(availablePoints).mul(100).toNumber()
    : 0;
  const boundedScore = Math.max(0, Math.min(100, rawScore));
  const masteryScore = new Prisma.Decimal(boundedScore).toDecimalPlaces(2);
  const previousScore = current?.masteryScore.toNumber() ?? 0;
  const difference = masteryScore.toNumber() - previousScore;
  const trend =
    difference > 0.01
      ? MasteryTrend.UP
      : difference < -0.01
        ? MasteryTrend.DOWN
        : MasteryTrend.STABLE;

  return {
    answeredCount,
    correctCount,
    earnedPoints,
    availablePoints,
    masteryScore,
    level: masteryLevelFor(masteryScore.toNumber(), answeredCount),
    trend,
  };
}

export async function applyRecommendationMasteryUpdates(
  transaction: Prisma.TransactionClient,
  input: {
    studentId: string;
    knowledgePointWeights: Array<{
      knowledgePointId: string;
      weight: Prisma.Decimal;
    }>;
    isCorrect: boolean;
    now: Date;
  },
): Promise<void> {
  for (const item of input.knowledgePointWeights) {
    if (item.weight.lte(0)) continue;
    const current = await transaction.studentKnowledgeMastery.findUnique({
      where: {
        studentId_knowledgePointId: {
          studentId: input.studentId,
          knowledgePointId: item.knowledgePointId,
        },
      },
      select: {
        answeredCount: true,
        correctCount: true,
        earnedPoints: true,
        availablePoints: true,
        masteryScore: true,
      },
    });
    const update = calculateMasteryUpdate(
      current,
      item.weight,
      input.isCorrect,
    );
    await transaction.studentKnowledgeMastery.upsert({
      where: {
        studentId_knowledgePointId: {
          studentId: input.studentId,
          knowledgePointId: item.knowledgePointId,
        },
      },
      update: {
        ...update,
        calculatedAt: input.now,
        sourceEndedAt: input.now,
      },
      create: {
        studentId: input.studentId,
        knowledgePointId: item.knowledgePointId,
        ...update,
        calculatedAt: input.now,
        sourceStartedAt: input.now,
        sourceEndedAt: input.now,
      },
    });
  }
}
