import "server-only";

import { prisma } from "@/lib/prisma";
import type { DatabaseHealth } from "@/services/system-health/types";

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const startedAt = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const responseTimeMs = Math.max(
      0,
      Math.round(performance.now() - startedAt),
    );
    return {
      status: responseTimeMs > 1_000 ? "DEGRADED" : "HEALTHY",
      responseTimeMs,
    };
  } catch {
    return { status: "UNAVAILABLE", responseTimeMs: null };
  }
}
