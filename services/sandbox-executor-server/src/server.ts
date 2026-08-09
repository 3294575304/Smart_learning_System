import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { readExecutorConfig } from "./config.js";
import {
  executionRequestFingerprint,
  type SandboxExecutionRequest,
  type SandboxExecutionResult,
  validateExecutionRequest,
} from "./contract.js";
import { DockerSandboxRunner } from "./runner.js";

const MAX_REQUEST_BYTES = 300 * 1024;
const MAX_RETAINED_EXECUTIONS = 1_000;
const TERMINAL_RETENTION_MS = 60 * 60 * 1000;

interface ExecutionRecord {
  request: SandboxExecutionRequest;
  fingerprint: string;
  result: SandboxExecutionResult;
  updatedAt: number;
}

function matchesSecret(supplied: Buffer, expected: string) {
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

function authorized(
  header: string | undefined,
  expected: string,
  previous: string | null,
) {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice("Bearer ".length));
  return (
    matchesSecret(supplied, expected) ||
    (previous !== null && matchesSecret(supplied, previous))
  );
}

function json(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown> | SandboxExecutionResult,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main() {
  const config = readExecutorConfig();
  await mkdir(config.workRoot, { recursive: true, mode: 0o700 });
  const runner = new DockerSandboxRunner(config);
  const records = new Map<string, ExecutionRecord>();
  const requestIds = new Map<string, string>();
  const queue: string[] = [];
  let active = 0;

  const prune = () => {
    const threshold = Date.now() - TERMINAL_RETENTION_MS;
    for (const [executionId, record] of records) {
      if (
        records.size <= MAX_RETAINED_EXECUTIONS &&
        record.updatedAt >= threshold
      )
        continue;
      if (
        record.result.status === "QUEUED" ||
        record.result.status === "RUNNING"
      )
        continue;
      records.delete(executionId);
      requestIds.delete(record.request.requestId);
    }
  };

  const schedule = () => {
    while (active < config.maxConcurrency && queue.length > 0) {
      const executionId = queue.shift();
      if (!executionId) return;
      const record = records.get(executionId);
      if (!record || record.result.status !== "QUEUED") continue;
      active += 1;
      record.result = { ...record.result, status: "RUNNING" };
      record.updatedAt = Date.now();
      void runner
        .run(executionId, record.request)
        .then((result) => {
          const current = records.get(executionId);
          if (!current || current.result.status === "CANCELLED") return;
          current.result = result;
          current.updatedAt = Date.now();
        })
        .finally(() => {
          active -= 1;
          prune();
          schedule();
        });
    }
  };

  const server = createServer(async (request, response) => {
    try {
      if (
        !authorized(
          request.headers.authorization,
          config.apiKey,
          config.previousApiKey,
        )
      ) {
        json(response, 401, { error: "UNAUTHORIZED" });
        return;
      }

      const url = new URL(request.url ?? "/", "http://executor.internal");
      if (request.method === "GET" && url.pathname === "/health") {
        json(response, 200, {
          status: "ok",
          executorVersion: config.executorVersion,
          active,
          queued: queue.length,
          maxConcurrency: config.maxConcurrency,
          maxQueueDepth: config.maxQueueDepth,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/executions") {
        const input = validateExecutionRequest(await readJson(request));
        if (!input) {
          json(response, 400, { error: "INVALID_EXECUTION_REQUEST" });
          return;
        }
        const fingerprint = executionRequestFingerprint(input);
        const existingId = requestIds.get(input.requestId);
        if (existingId) {
          const existing = records.get(existingId);
          if (!existing || existing.fingerprint !== fingerprint) {
            json(response, 409, { error: "REQUEST_ID_CONFLICT" });
            return;
          }
          json(response, 200, {
            executionId: existingId,
            executorVersion: config.executorVersion,
          });
          return;
        }

        if (queue.length >= config.maxQueueDepth) {
          json(
            response,
            429,
            { error: "EXECUTOR_QUEUE_FULL", retryable: true },
            { "retry-after": "1" },
          );
          return;
        }

        const executionId = `exec_${randomUUID()}`;
        records.set(executionId, {
          request: input,
          fingerprint,
          updatedAt: Date.now(),
          result: {
            executionId,
            status: "QUEUED",
            executorVersion: config.executorVersion,
            errorType: "NONE",
            exitCode: null,
            stdout: "",
            stderr: "",
            resourceUsage: null,
            tests: [],
          },
        });
        requestIds.set(input.requestId, executionId);
        queue.push(executionId);
        schedule();
        json(response, 202, {
          executionId,
          executorVersion: config.executorVersion,
        });
        return;
      }

      const executionMatch = /^\/v1\/executions\/([^/]+)$/u.exec(url.pathname);
      if (request.method === "GET" && executionMatch) {
        const record = records.get(decodeURIComponent(executionMatch[1] ?? ""));
        if (!record) {
          json(response, 404, { error: "EXECUTION_NOT_FOUND" });
          return;
        }
        json(response, 200, record.result);
        return;
      }

      const cancelMatch = /^\/v1\/executions\/([^/]+)\/cancel$/u.exec(
        url.pathname,
      );
      if (request.method === "POST" && cancelMatch) {
        const executionId = decodeURIComponent(cancelMatch[1] ?? "");
        const record = records.get(executionId);
        if (!record) {
          json(response, 404, { error: "EXECUTION_NOT_FOUND" });
          return;
        }
        if (
          record.result.status === "QUEUED" ||
          record.result.status === "RUNNING"
        ) {
          record.result = {
            ...record.result,
            status: "CANCELLED",
            errorType: "CANCELLED",
          };
          record.updatedAt = Date.now();
          await runner.cancel(executionId);
        }
        response.writeHead(204, { "cache-control": "no-store" });
        response.end();
        return;
      }

      json(response, 404, { error: "NOT_FOUND" });
    } catch (error) {
      json(response, error instanceof SyntaxError ? 400 : 500, {
        error: error instanceof SyntaxError ? "INVALID_JSON" : "INTERNAL_ERROR",
      });
    }
  });

  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(config.port, config.bindHost, () => {
    console.log(
      JSON.stringify({
        event: "executor_started",
        host: config.bindHost,
        port: config.port,
        version: config.executorVersion,
        maxConcurrency: config.maxConcurrency,
        maxQueueDepth: config.maxQueueDepth,
      }),
    );
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 30_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(() => {
  console.error(JSON.stringify({ event: "executor_start_failed" }));
  process.exitCode = 1;
});
