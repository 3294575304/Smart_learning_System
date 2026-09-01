import { hostname } from "node:os";

export interface LongTaskWorkerConfig {
  workerId: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  recoveryIntervalMs: number;
  wakePort: number;
  workerSecret: string;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error("Invalid long-task worker numeric configuration");
  return parsed;
}

export function readLongTaskWorkerConfig(
  environment: Record<string, string | undefined> = process.env,
): LongTaskWorkerConfig {
  const workerSecret = environment.BACKGROUND_JOB_WORKER_SECRET?.trim() ?? "";
  if (workerSecret.length < 32)
    throw new Error(
      "BACKGROUND_JOB_WORKER_SECRET must contain at least 32 characters",
    );
  return {
    workerId:
      environment.BACKGROUND_LONG_TASK_WORKER_ID?.trim() ||
      `long-task-${hostname()}`,
    pollIntervalMs: integer(
      environment.BACKGROUND_LONG_TASK_WORKER_POLL_INTERVAL_MS,
      2_000,
      100,
      30_000,
    ),
    leaseDurationMs: integer(
      environment.BACKGROUND_LONG_TASK_WORKER_LEASE_DURATION_MS,
      120_000,
      10_000,
      300_000,
    ),
    recoveryIntervalMs: integer(
      environment.BACKGROUND_LONG_TASK_WORKER_RECOVERY_INTERVAL_MS,
      30_000,
      5_000,
      300_000,
    ),
    wakePort: integer(
      environment.BACKGROUND_LONG_TASK_WORKER_WAKE_PORT,
      18_789,
      1_024,
      65_535,
    ),
    workerSecret,
  };
}
