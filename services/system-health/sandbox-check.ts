import "server-only";

import { HttpSandboxExecutor } from "@/services/sandbox-executor/http-executor";
import type { SandboxHealth } from "@/services/system-health/types";

export async function checkSandboxHealth(): Promise<SandboxHealth> {
  const configured = Boolean(
    process.env.SANDBOX_EXECUTOR_URL?.trim() &&
    process.env.SANDBOX_EXECUTOR_API_KEY?.trim(),
  );
  if (!configured) {
    return {
      status: "DISABLED",
      configurationComplete: false,
      executorVersion: null,
      active: null,
      queued: null,
      maxConcurrency: null,
      maxQueueDepth: null,
    };
  }
  try {
    const health = await new HttpSandboxExecutor().health();
    return {
      status: health.queued >= health.maxQueueDepth ? "DEGRADED" : "HEALTHY",
      configurationComplete: true,
      executorVersion: health.executorVersion,
      active: health.active,
      queued: health.queued,
      maxConcurrency: health.maxConcurrency,
      maxQueueDepth: health.maxQueueDepth,
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      configurationComplete: true,
      executorVersion: null,
      active: null,
      queued: null,
      maxConcurrency: null,
      maxQueueDepth: null,
    };
  }
}
