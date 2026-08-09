import { resolve } from "node:path";

export interface ExecutorConfig {
  apiKey: string;
  previousApiKey: string | null;
  bindHost: string;
  port: number;
  maxConcurrency: number;
  maxQueueDepth: number;
  dockerBinary: string;
  dockerRuntime: string;
  runtimeImage: string;
  workRoot: string;
  executorVersion: string;
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
    throw new Error("Invalid numeric executor configuration");
  }
  return parsed;
}

export function readExecutorConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ExecutorConfig {
  const apiKey = environment.SANDBOX_EXECUTOR_API_KEY?.trim();
  if (!apiKey || apiKey.length < 32) {
    throw new Error(
      "SANDBOX_EXECUTOR_API_KEY must contain at least 32 characters",
    );
  }
  const previousApiKey = environment.SANDBOX_EXECUTOR_PREVIOUS_API_KEY?.trim();
  if (previousApiKey && previousApiKey.length < 32) {
    throw new Error(
      "SANDBOX_EXECUTOR_PREVIOUS_API_KEY must contain at least 32 characters",
    );
  }

  return {
    apiKey,
    previousApiKey: previousApiKey || null,
    bindHost: environment.SANDBOX_EXECUTOR_BIND_HOST?.trim() || "127.0.0.1",
    port: boundedInteger(environment.SANDBOX_EXECUTOR_PORT, 8788, 1, 65_535),
    maxConcurrency: boundedInteger(
      environment.SANDBOX_EXECUTOR_MAX_CONCURRENCY,
      1,
      1,
      4,
    ),
    maxQueueDepth: boundedInteger(
      environment.SANDBOX_EXECUTOR_MAX_QUEUE_DEPTH,
      100,
      1,
      10_000,
    ),
    dockerBinary:
      environment.SANDBOX_DOCKER_BINARY?.trim() || "/usr/bin/docker",
    dockerRuntime: environment.SANDBOX_DOCKER_RUNTIME?.trim() || "runsc",
    runtimeImage:
      environment.SANDBOX_RUNTIME_IMAGE?.trim() ||
      "zhixue-python-sandbox:3.10-v1",
    workRoot: resolve(
      environment.SANDBOX_EXECUTOR_WORK_ROOT?.trim() ||
        "/var/lib/zhixue-sandbox-executor/work",
    ),
    executorVersion:
      environment.SANDBOX_EXECUTOR_VERSION?.trim() ||
      "zhixue-sandbox-executor-0.1.0",
  };
}
