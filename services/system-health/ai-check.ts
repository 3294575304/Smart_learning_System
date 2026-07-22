import "server-only";

import { AIRecordStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { percentage } from "@/services/admin/dashboard/metrics";
import { createAIProvider } from "@/services/ai/provider-factory";
import { deriveAIHealthStatus } from "@/services/system-health/metrics";
import type { AIHealth } from "@/services/system-health/types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;

export async function checkAIHealth(
  enabled: boolean,
  now = new Date(),
): Promise<AIHealth> {
  if (!enabled) {
    return {
      status: "DISABLED",
      configurationComplete: true,
      successfulExecutionsLast7Days: 0,
      issueExecutionsLast7Days: 0,
      successRateLast7Days: null,
      lastSuccessAt: null,
      lastIssueAt: null,
    };
  }

  try {
    createAIProvider();
  } catch {
    return {
      status: "UNAVAILABLE",
      configurationComplete: false,
      successfulExecutionsLast7Days: 0,
      issueExecutionsLast7Days: 0,
      successRateLast7Days: null,
      lastSuccessAt: null,
      lastIssueAt: null,
    };
  }

  const since = new Date(now.getTime() - SEVEN_DAYS_MS);
  const issueStatuses = [AIRecordStatus.FAILED, AIRecordStatus.FALLBACK];
  const [
    analysisSuccesses,
    tutoringSuccesses,
    analysisIssues,
    tutoringIssues,
    latestAnalysisSuccess,
    latestTutoringSuccess,
    latestAnalysisIssue,
    latestTutoringIssue,
  ] = await Promise.all([
    prisma.aIAnalysis.count({
      where: { status: AIRecordStatus.SUCCEEDED, createdAt: { gte: since } },
    }),
    prisma.aITutoringRecord.count({
      where: { status: AIRecordStatus.SUCCEEDED, createdAt: { gte: since } },
    }),
    prisma.aIAnalysis.count({
      where: { status: { in: issueStatuses }, createdAt: { gte: since } },
    }),
    prisma.aITutoringRecord.count({
      where: { status: { in: issueStatuses }, createdAt: { gte: since } },
    }),
    prisma.aIAnalysis.findFirst({
      where: { status: AIRecordStatus.SUCCEEDED, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.aITutoringRecord.findFirst({
      where: { status: AIRecordStatus.SUCCEEDED, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.aIAnalysis.findFirst({
      where: { status: { in: issueStatuses } },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      select: { completedAt: true, createdAt: true },
    }),
    prisma.aITutoringRecord.findFirst({
      where: { status: { in: issueStatuses } },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      select: { completedAt: true, createdAt: true },
    }),
  ]);

  const successCount = analysisSuccesses + tutoringSuccesses;
  const issueCount = analysisIssues + tutoringIssues;
  const latestSuccess = [
    latestAnalysisSuccess?.completedAt,
    latestTutoringSuccess?.completedAt,
  ]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const latestIssue = [
    latestAnalysisIssue?.completedAt ?? latestAnalysisIssue?.createdAt,
    latestTutoringIssue?.completedAt ?? latestTutoringIssue?.createdAt,
  ]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return {
    status: deriveAIHealthStatus(successCount, issueCount),
    configurationComplete: true,
    successfulExecutionsLast7Days: successCount,
    issueExecutionsLast7Days: issueCount,
    successRateLast7Days: percentage(successCount, successCount + issueCount),
    lastSuccessAt: latestSuccess?.toISOString() ?? null,
    lastIssueAt: latestIssue?.toISOString() ?? null,
  };
}
