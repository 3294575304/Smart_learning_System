import "server-only";

import {
  sandboxExecutionRequestSchema,
  sandboxExecutionResultSchema,
  sandboxHealthSchema,
  sandboxSubmissionReceiptSchema,
  type SandboxExecutionRequest,
} from "@/services/sandbox-executor/schemas";
import type { SandboxExecutor } from "@/services/sandbox-executor/executor";

function executorConfiguration() {
  const baseUrl = process.env.SANDBOX_EXECUTOR_URL?.trim();
  const apiKey = process.env.SANDBOX_EXECUTOR_API_KEY?.trim();
  if (!baseUrl || !apiKey || apiKey.length < 32) {
    throw new Error("Sandbox executor is not configured");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export class SandboxExecutorHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
  ) {
    super(`Sandbox executor returned ${status}`);
    this.name = "SandboxExecutorHttpError";
  }
}

export class HttpSandboxExecutor implements SandboxExecutor {
  readonly transport = "REMOTE" as const;

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const config = executorConfiguration();
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
      throw new SandboxExecutorHttpError(
        response.status,
        Number.isFinite(retryAfterSeconds)
          ? Math.max(0, retryAfterSeconds * 1_000)
          : null,
      );
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async submitExecution(request: SandboxExecutionRequest) {
    const input = sandboxExecutionRequestSchema.parse(request);
    return sandboxSubmissionReceiptSchema.parse(
      await this.request("/v1/executions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  }

  async getExecution(executionId: string) {
    return sandboxExecutionResultSchema.parse(
      await this.request(`/v1/executions/${encodeURIComponent(executionId)}`),
    );
  }

  async cancelExecution(executionId: string): Promise<void> {
    await this.request(
      `/v1/executions/${encodeURIComponent(executionId)}/cancel`,
      {
        method: "POST",
      },
    );
  }

  async health() {
    return sandboxHealthSchema.parse(await this.request("/health"));
  }
}
