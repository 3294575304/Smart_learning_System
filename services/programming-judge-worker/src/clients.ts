import { z } from "zod";

import type { WorkerConfig } from "./config.js";
import {
  apiEnvelopeSchema,
  claimedJobSchema,
  executorResultSchema,
  programmingAttemptPayloadSchema,
} from "./contracts.js";

export class RemoteRequestError extends Error {
  constructor(
    readonly service: "application" | "executor",
    readonly status: number,
    readonly retryAfterMs: number | null = null,
  ) {
    super(`${service} returned ${status}`);
    this.name = "RemoteRequestError";
  }
}

async function jsonRequest(
  service: "application" | "executor",
  url: string,
  secret: string,
  init: RequestInit,
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new RemoteRequestError(
      service,
      response.status,
      Number.isFinite(retryAfter) ? Math.max(0, retryAfter * 1_000) : null,
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

export class ApplicationClient {
  constructor(private readonly config: WorkerConfig) {}

  async recover() {
    return jsonRequest(
      "application",
      `${this.config.applicationUrl}/api/internal/background-jobs/recover`,
      this.config.workerSecret,
      { method: "POST", body: "{}" },
    );
  }

  async claim(executorVersion: string) {
    const raw = await jsonRequest(
      "application",
      `${this.config.applicationUrl}/api/internal/background-jobs/claim`,
      this.config.workerSecret,
      {
        method: "POST",
        body: JSON.stringify({
          workerId: this.config.workerId,
          executorVersion,
          acceptedTypes: [
            "PYTHON_EXECUTION",
            "PYTHON_PUBLIC_RUN",
            "PYTHON_JUDGE",
          ],
          leaseDurationMs: this.config.leaseDurationMs,
        }),
      },
    );
    return apiEnvelopeSchema(claimedJobSchema.nullable()).parse(raw).data;
  }

  async heartbeat(jobId: string, leaseId: string, progress: number) {
    await jsonRequest(
      "application",
      `${this.config.applicationUrl}/api/internal/background-jobs/${encodeURIComponent(jobId)}/heartbeat`,
      this.config.workerSecret,
      {
        method: "POST",
        body: JSON.stringify({
          leaseId,
          progress,
          leaseDurationMs: this.config.leaseDurationMs,
        }),
      },
    );
  }

  async complete(jobId: string, leaseId: string, result: unknown) {
    await jsonRequest(
      "application",
      `${this.config.applicationUrl}/api/internal/background-jobs/${encodeURIComponent(jobId)}/complete`,
      this.config.workerSecret,
      { method: "POST", body: JSON.stringify({ leaseId, result }) },
    );
  }

  async programmingAttemptPayload(attemptId: string) {
    const raw = await jsonRequest(
      "application",
      `${this.config.applicationUrl}/api/internal/programming-attempts/${encodeURIComponent(attemptId)}/payload`,
      this.config.workerSecret,
      { method: "GET" },
    );
    return apiEnvelopeSchema(programmingAttemptPayloadSchema).parse(raw).data;
  }

  async fail(
    jobId: string,
    leaseId: string,
    errorCode: string,
    retryable: boolean,
  ) {
    await jsonRequest(
      "application",
      `${this.config.applicationUrl}/api/internal/background-jobs/${encodeURIComponent(jobId)}/fail`,
      this.config.workerSecret,
      {
        method: "POST",
        body: JSON.stringify({ leaseId, errorCode, retryable }),
      },
    );
  }
}

const healthSchema = z
  .object({
    status: z.literal("ok"),
    executorVersion: z.string().min(1),
  })
  .passthrough();
const receiptSchema = z
  .object({
    executionId: z.string().min(1),
    executorVersion: z.string().min(1),
  })
  .strict();

export class ExecutorClient {
  constructor(private readonly config: WorkerConfig) {}

  private request(path: string, init: RequestInit) {
    return jsonRequest(
      "executor",
      `${this.config.executorUrl}${path}`,
      this.config.executorApiKey,
      init,
    );
  }

  async health() {
    return healthSchema.parse(await this.request("/health", { method: "GET" }));
  }

  async submit(input: {
    requestId: string;
    sourceCode: string;
    stdin?: string;
    limits: Record<string, number>;
    jobId: string;
  }) {
    return receiptSchema.parse(
      await this.request("/v1/executions", {
        method: "POST",
        body: JSON.stringify({
          requestId: input.requestId,
          language: "PYTHON",
          sourceCode: input.sourceCode,
          stdin: input.stdin ?? "",
          networkAccess: false,
          limits: input.limits,
          metadata: { jobId: input.jobId, purpose: "FUTURE_JUDGE" },
        }),
      }),
    );
  }

  async get(executionId: string) {
    return executorResultSchema.parse(
      await this.request(`/v1/executions/${encodeURIComponent(executionId)}`, {
        method: "GET",
      }),
    );
  }

  async cancel(executionId: string) {
    await this.request(
      `/v1/executions/${encodeURIComponent(executionId)}/cancel`,
      {
        method: "POST",
      },
    );
  }
}
