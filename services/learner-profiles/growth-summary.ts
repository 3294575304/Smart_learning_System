import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { LEARNER_PROFILE_RULE_VERSION } from "@/services/learner-profiles/constants";

function dimensionNumber(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : null;
}

/**
 * 知识与成长的页头概览：只读最新两个快照 + 近 7 天事件数，不触发重算。
 * 四个子页共用同一口径，避免每个页面各写一套「本周有没有进步」。
 */
export async function getStudentGrowthSummary(
  studentId: string,
  courseId: string,
) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [snapshots, weeklyEvidence] = await Promise.all([
    prisma.learnerProfileSnapshot.findMany({
      where: {
        studentId,
        courseId,
        calculationRuleVersion: LEARNER_PROFILE_RULE_VERSION,
      },
      orderBy: { revisionNumber: "desc" },
      take: 2,
      select: {
        revisionNumber: true,
        createdAt: true,
        objectiveMasteryDimension: true,
        activityDimension: true,
        _count: {
          select: {
            concepts: {
              where: { evidenceState: "CONCLUSIVE", masteryScore: { lt: 80 } },
            },
          },
        },
      },
    }),
    prisma.learningEvent.count({
      where: {
        studentId,
        courseId,
        supersededBy: null,
        occurredAt: { gte: weekAgo },
        projectedEvidence: { none: { assignment: { status: "REVOKED" } } },
      },
    }),
  ]);
  const latest = snapshots[0];
  if (!latest) return null;
  const previous = snapshots[1] ?? null;
  const mastery = dimensionNumber(
    latest.objectiveMasteryDimension,
    "conclusiveAverageMastery",
  );
  const previousMastery = previous
    ? dimensionNumber(
        previous.objectiveMasteryDimension,
        "conclusiveAverageMastery",
      )
    : null;
  const delta =
    mastery !== null && previousMastery !== null
      ? Number((mastery - previousMastery).toFixed(1))
      : null;
  const needsSupport = latest._count.concepts;
  return {
    revisionNumber: latest.revisionNumber,
    generatedAt: latest.createdAt,
    ruleVersion: LEARNER_PROFILE_RULE_VERSION,
    mastery,
    masteryDelta: delta,
    previousRevision: previous?.revisionNumber ?? null,
    weeklyEvidence,
    needsSupport,
    activeDays: dimensionNumber(latest.activityDimension, "activeDays") ?? 0,
    activityWindowDays:
      dimensionNumber(latest.activityDimension, "windowDays") ?? 14,
  };
}

export type StudentGrowthSummary = NonNullable<
  Awaited<ReturnType<typeof getStudentGrowthSummary>>
>;
