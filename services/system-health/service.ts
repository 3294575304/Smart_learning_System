import "server-only";

import { AIRecordStatus, Role, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { checkAIHealth } from "@/services/system-health/ai-check";
import { checkDatabaseHealth } from "@/services/system-health/database-check";
import { deriveOverallHealthStatus } from "@/services/system-health/metrics";
import type { SystemHealthResult } from "@/services/system-health/types";
import { getSystemConfig } from "@/services/system-config/service";

const STALE_AI_TASK_MS = 15 * 60 * 1_000;

export async function getSystemHealth(
  now = new Date(),
): Promise<SystemHealthResult> {
  const [
    database,
    config,
    activeAdminCount,
    staleAnalysisCount,
    staleTutoringCount,
  ] = await Promise.all([
    checkDatabaseHealth(),
    getSystemConfig(),
    prisma.user.count({
      where: { role: Role.ADMIN, status: UserStatus.ACTIVE },
    }),
    prisma.aIAnalysis.count({
      where: {
        status: AIRecordStatus.PENDING,
        createdAt: { lt: new Date(now.getTime() - STALE_AI_TASK_MS) },
      },
    }),
    prisma.aITutoringRecord.count({
      where: {
        status: AIRecordStatus.PENDING,
        createdAt: { lt: new Date(now.getTime() - STALE_AI_TASK_MS) },
      },
    }),
  ]);
  const ai = await checkAIHealth(config.aiAnalysisEnabled, now);
  const activeAdminAvailable = activeAdminCount > 0;
  const stalePendingAITaskCount = staleAnalysisCount + staleTutoringCount;
  return {
    status: deriveOverallHealthStatus({
      database: database.status,
      ai: ai.status,
      activeAdminAvailable,
      stalePendingAITaskCount,
    }),
    checkedAt: now.toISOString(),
    database,
    ai,
    config: {
      platformName: config.platformName,
      maintenanceMode: config.maintenanceMode,
      aiAnalysisEnabled: config.aiAnalysisEnabled,
    },
    data: { activeAdminAvailable, stalePendingAITaskCount },
  };
}
