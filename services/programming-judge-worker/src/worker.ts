import { createHash } from "node:crypto";

import type { WorkerConfig } from "./config.js";
import {
  ApplicationClient,
  ExecutorClient,
  RemoteRequestError,
} from "./clients.js";
import {
  pythonExecutionJobInputSchema,
  programmingJobInputSchema,
  type ClaimedJob,
  type ExecutorResult,
} from "./contracts.js";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function deterministicUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function programmingExecutionRequestId(
  jobId: string,
  inputFingerprint: string,
  testCaseId: string,
) {
  return deterministicUuid(`${jobId}:${inputFingerprint}:${testCaseId}`);
}

function normalizeOutput(value: string) {
  return value.replace(/\r\n?/gu, "\n").trimEnd();
}

export class ProgrammingJudgeWorker {
  private readonly application: ApplicationClient;
  private readonly executor: ExecutorClient;
  private stopping = false;
  private lastRecoveryAt = 0;

  constructor(private readonly config: WorkerConfig) {
    this.application = new ApplicationClient(config);
    this.executor = new ExecutorClient(config);
  }

  stop() {
    this.stopping = true;
  }

  async runForever() {
    while (!this.stopping) {
      try {
        const health = await this.executor.health();
        if (
          Date.now() - this.lastRecoveryAt >=
          this.config.recoveryIntervalMs
        ) {
          await this.application.recover();
          this.lastRecoveryAt = Date.now();
        }
        const job = await this.application.claim(health.executorVersion);
        if (!job) {
          await delay(this.config.pollIntervalMs);
          continue;
        }
        await this.process(job);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "worker_loop_error",
            error: error instanceof Error ? error.name : "UnknownError",
          }),
        );
        await delay(this.config.pollIntervalMs);
      }
    }
  }

  private async process(job: ClaimedJob) {
    if (job.type === "PYTHON_PUBLIC_RUN" || job.type === "PYTHON_JUDGE") {
      await this.processProgrammingAttempt(job);
      return;
    }
    const input = pythonExecutionJobInputSchema.safeParse(job.input);
    if (!input.success || job.type !== "PYTHON_EXECUTION") {
      await this.application.fail(
        job.id,
        job.currentLeaseId,
        "UNSUPPORTED_JOB_INPUT",
        false,
      );
      return;
    }

    let executionId: string | null = null;
    try {
      await this.application.heartbeat(job.id, job.currentLeaseId, 5);
      executionId = (
        await this.submitWithBackpressure({ ...input.data, jobId: job.id })
      ).executionId;
      let result: ExecutorResult;
      while (true) {
        await delay(Math.min(1_000, this.config.pollIntervalMs));
        await this.application.heartbeat(job.id, job.currentLeaseId, 50);
        try {
          result = await this.executor.get(executionId);
        } catch (error) {
          if (
            error instanceof RemoteRequestError &&
            error.service === "executor" &&
            error.status === 404
          ) {
            executionId = (
              await this.submitWithBackpressure({
                ...input.data,
                jobId: job.id,
              })
            ).executionId;
            continue;
          }
          throw error;
        }
        if (TERMINAL.has(result.status)) break;
      }

      if (result.errorType === "INTERNAL_ERROR") {
        await this.application.fail(
          job.id,
          job.currentLeaseId,
          "EXECUTOR_INTERNAL_ERROR",
          true,
        );
        return;
      }
      await this.application.complete(job.id, job.currentLeaseId, result);
    } catch (error) {
      if (executionId) {
        try {
          await this.executor.cancel(executionId);
        } catch {
          // A lost lease or unavailable executor makes cancellation best effort.
        }
      }
      if (
        error instanceof RemoteRequestError &&
        error.service === "application" &&
        error.status === 409
      ) {
        return;
      }
      try {
        await this.application.fail(
          job.id,
          job.currentLeaseId,
          "WORKER_DEPENDENCY_ERROR",
          true,
        );
      } catch {
        // The lease may already have expired and been recovered by another worker.
      }
    }
  }

  private async processProgrammingAttempt(job: ClaimedJob) {
    const input = programmingJobInputSchema.safeParse(job.input);
    if (!input.success) {
      await this.application.fail(
        job.id,
        job.currentLeaseId,
        "UNSUPPORTED_JOB_INPUT",
        false,
      );
      return;
    }
    let activeExecutionId: string | null = null;
    try {
      const payload = await this.application.programmingAttemptPayload(
        input.data.programmingAttemptId,
      );
      const cases = [];
      for (let index = 0; index < payload.testCases.length; index += 1) {
        const testCase = payload.testCases[index]!;
        await this.application.heartbeat(
          job.id,
          job.currentLeaseId,
          Math.max(1, Math.floor((index / payload.testCases.length) * 90)),
        );
        const request = {
          requestId: programmingExecutionRequestId(
            job.id,
            payload.inputFingerprint,
            testCase.id,
          ),
          sourceCode: payload.sourceCode.trim() ? payload.sourceCode : "pass\n",
          stdin: testCase.stdin,
          limits: payload.limits,
          jobId: job.id,
        };
        activeExecutionId = (await this.submitWithBackpressure(request))
          .executionId;
        let result: ExecutorResult;
        while (true) {
          await delay(Math.min(1_000, this.config.pollIntervalMs));
          await this.application.heartbeat(
            job.id,
            job.currentLeaseId,
            Math.max(
              1,
              Math.floor(((index + 0.5) / payload.testCases.length) * 90),
            ),
          );
          try {
            result = await this.executor.get(activeExecutionId);
          } catch (error) {
            if (
              error instanceof RemoteRequestError &&
              error.service === "executor" &&
              error.status === 404
            ) {
              activeExecutionId = (await this.submitWithBackpressure(request))
                .executionId;
              continue;
            }
            throw error;
          }
          if (TERMINAL.has(result.status)) break;
        }
        if (result.errorType === "INTERNAL_ERROR") {
          await this.application.fail(
            job.id,
            job.currentLeaseId,
            "EXECUTOR_INTERNAL_ERROR",
            true,
          );
          return;
        }
        cases.push({
          testCaseId: testCase.id,
          passed:
            result.errorType === "NONE" &&
            normalizeOutput(result.stdout) ===
              normalizeOutput(testCase.expectedOutput),
          errorType: result.errorType,
          stdout: result.stdout.slice(0, 65_536),
          stderr: result.stderr.slice(0, 65_536),
          resourceUsage: result.resourceUsage,
        });
        activeExecutionId = null;
      }
      await this.application.complete(job.id, job.currentLeaseId, {
        attemptId: payload.attemptId,
        cases,
      });
    } catch (error) {
      if (activeExecutionId) {
        try {
          await this.executor.cancel(activeExecutionId);
        } catch {
          // Cancellation is best effort after a dependency or lease failure.
        }
      }
      if (
        error instanceof RemoteRequestError &&
        error.service === "application" &&
        error.status === 409
      ) {
        return;
      }
      try {
        await this.application.fail(
          job.id,
          job.currentLeaseId,
          "WORKER_DEPENDENCY_ERROR",
          true,
        );
      } catch {
        // The task may already be recovered by another worker.
      }
    }
  }

  private async submitWithBackpressure(input: {
    requestId: string;
    sourceCode: string;
    stdin?: string;
    limits: Record<string, number>;
    jobId: string;
  }) {
    while (true) {
      try {
        return await this.executor.submit(input);
      } catch (error) {
        if (
          !(error instanceof RemoteRequestError) ||
          error.service !== "executor" ||
          error.status !== 429
        ) {
          throw error;
        }
        await delay(error.retryAfterMs ?? this.config.pollIntervalMs);
      }
    }
  }
}
