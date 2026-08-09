import { hostname } from "node:os";

export interface WorkerConfig {
  applicationUrl: string;
  workerSecret: string;
  executorUrl: string;
  executorApiKey: string;
  workerId: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  recoveryIntervalMs: number;
}

function requiredSecret(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value || value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
  return value;
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("Invalid numeric worker configuration");
  }
  return parsed;
}

function requiredUrl(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  return value.replace(/\/$/u, "");
}

export function readWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkerConfig {
  return {
    applicationUrl: requiredUrl(environment, "APPLICATION_INTERNAL_URL"),
    workerSecret: requiredSecret(environment, "BACKGROUND_JOB_WORKER_SECRET"),
    executorUrl: requiredUrl(environment, "SANDBOX_EXECUTOR_URL"),
    executorApiKey: requiredSecret(environment, "SANDBOX_EXECUTOR_API_KEY"),
    workerId:
      environment.PROGRAMMING_JUDGE_WORKER_ID?.trim() ||
      `programming-judge-${hostname()}`,
    pollIntervalMs: boundedInteger(
      environment.PROGRAMMING_JUDGE_POLL_INTERVAL_MS,
      1_000,
      100,
      30_000,
    ),
    leaseDurationMs: boundedInteger(
      environment.PROGRAMMING_JUDGE_LEASE_DURATION_MS,
      30_000,
      10_000,
      300_000,
    ),
    recoveryIntervalMs: boundedInteger(
      environment.PROGRAMMING_JUDGE_RECOVERY_INTERVAL_MS,
      30_000,
      5_000,
      300_000,
    ),
  };
}
