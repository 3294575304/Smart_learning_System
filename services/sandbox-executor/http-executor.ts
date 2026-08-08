import "server-only";

import {
  sandboxExecutionRequestSchema,
  sandboxExecutionResultSchema,
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
    if (!response.ok)
      throw new Error(`Sandbox executor returned ${response.status}`);
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
}
