import { createHash } from "node:crypto";

export type SandboxErrorType =
  | "NONE"
  | "SYNTAX_ERROR"
  | "RUNTIME_ERROR"
  | "TIME_LIMIT"
  | "MEMORY_LIMIT"
  | "OUTPUT_LIMIT"
  | "PROCESS_LIMIT"
  | "SECURITY_VIOLATION"
  | "CANCELLED"
  | "INTERNAL_ERROR";

export interface SandboxLimits {
  cpuTimeMs: number;
  wallTimeMs: number;
  memoryBytes: number;
  outputBytes: number;
  processCount: number;
}

export interface SandboxExecutionRequest {
  requestId: string;
  language: "PYTHON";
  sourceCode: string;
  stdin: string;
  networkAccess: false;
  limits: SandboxLimits;
  metadata: {
    jobId?: string;
    purpose: "SECURITY_PROBE" | "FUTURE_JUDGE";
  };
}

export interface SandboxResourceUsage {
  cpuTimeMs: number | null;
  wallTimeMs: number;
  peakMemoryBytes: number | null;
  outputBytes: number;
  processCount: number | null;
}

export interface SandboxExecutionResult {
  executionId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  executorVersion: string;
  errorType: SandboxErrorType;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  resourceUsage: SandboxResourceUsage | null;
  tests: [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  const expected = new Set(allowed);
  return Object.keys(value).every((key) => expected.has(key));
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

export function validateExecutionRequest(
  value: unknown,
): SandboxExecutionRequest | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "requestId",
      "language",
      "sourceCode",
      "stdin",
      "networkAccess",
      "limits",
      "metadata",
    ]) ||
    !isUuid(value.requestId) ||
    value.language !== "PYTHON" ||
    typeof value.sourceCode !== "string" ||
    value.sourceCode.length < 1 ||
    value.sourceCode.length > 200_000 ||
    typeof value.stdin !== "string" ||
    value.stdin.length > 65_536 ||
    value.networkAccess !== false ||
    !isRecord(value.limits) ||
    !hasOnlyKeys(value.limits, [
      "cpuTimeMs",
      "wallTimeMs",
      "memoryBytes",
      "outputBytes",
      "processCount",
    ]) ||
    !boundedInteger(value.limits.cpuTimeMs, 10, 30_000) ||
    !boundedInteger(value.limits.wallTimeMs, 10, 60_000) ||
    !boundedInteger(value.limits.memoryBytes, 1_048_576, 536_870_912) ||
    !boundedInteger(value.limits.outputBytes, 1_024, 1_048_576) ||
    !boundedInteger(value.limits.processCount, 1, 64) ||
    !isRecord(value.metadata) ||
    !hasOnlyKeys(value.metadata, ["jobId", "purpose"]) ||
    (value.metadata.purpose !== "SECURITY_PROBE" &&
      value.metadata.purpose !== "FUTURE_JUDGE") ||
    (value.metadata.jobId !== undefined &&
      (typeof value.metadata.jobId !== "string" ||
        !/^c[a-z0-9]{24,}$/u.test(value.metadata.jobId)))
  ) {
    return null;
  }

  return value as unknown as SandboxExecutionRequest;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function executionRequestFingerprint(request: SandboxExecutionRequest) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(request)))
    .digest("hex");
}
