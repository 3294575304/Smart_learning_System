import { randomUUID } from "node:crypto";

import type { SandboxExecutor } from "@/services/sandbox-executor/executor";
import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
} from "@/services/sandbox-executor/schemas";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

interface ProbeDefinition {
  name: string;
  sourceCode: string;
  verify(result: SandboxExecutionResult): boolean;
}

const constrainedLimits = {
  cpuTimeMs: 500,
  wallTimeMs: 1_500,
  memoryBytes: 32 * 1024 * 1024,
  outputBytes: 8 * 1024,
  processCount: 2,
} as const;

const probes: readonly ProbeDefinition[] = [
  {
    name: "network-disabled",
    sourceCode:
      "import socket\ns=socket.socket();s.settimeout(1)\ntry:\n s.connect(('1.1.1.1',53));print('CONNECTED')\nexcept Exception:\n print('BLOCKED')",
    verify: (result) =>
      !result.stdout.includes("CONNECTED") &&
      (result.stdout.includes("BLOCKED") ||
        result.errorType === "SECURITY_VIOLATION"),
  },
  {
    name: "cpu-limit",
    sourceCode: "while True:\n pass",
    verify: (result) => result.errorType === "TIME_LIMIT",
  },
  {
    name: "wall-time-limit",
    sourceCode: "import time\ntime.sleep(60)",
    verify: (result) => result.errorType === "TIME_LIMIT",
  },
  {
    name: "memory-limit",
    sourceCode: "x=bytearray(256*1024*1024)\nprint(len(x))",
    verify: (result) => result.errorType === "MEMORY_LIMIT",
  },
  {
    name: "filesystem-isolation",
    sourceCode:
      "try:\n open('/host/etc/passwd').read();print('HOST_FILE_READ')\nexcept Exception:\n print('BLOCKED')",
    verify: (result) =>
      !result.stdout.includes("HOST_FILE_READ") &&
      result.stdout.includes("BLOCKED"),
  },
  {
    name: "process-limit",
    sourceCode:
      "import os\nchildren=[]\nfor _ in range(16):\n children.append(os.fork())\nprint('FORKED',len(children))",
    verify: (result) =>
      result.errorType === "PROCESS_LIMIT" ||
      result.errorType === "SECURITY_VIOLATION",
  },
  {
    name: "output-limit",
    sourceCode: "print('x'*(1024*1024))",
    verify: (result) =>
      result.errorType === "OUTPUT_LIMIT" &&
      (result.resourceUsage?.outputBytes ?? 0) <= constrainedLimits.outputBytes,
  },
  {
    name: "host-secrets-hidden",
    sourceCode:
      "import os\nnames=['DATABASE_URL','TEST_DATABASE_URL','BACKGROUND_JOB_WORKER_SECRET','SANDBOX_EXECUTOR_API_KEY','AI_API_KEY']\nprint('LEAK' if any(os.getenv(n) for n in names) else 'SAFE')",
    verify: (result) =>
      !result.stdout.includes("LEAK") && result.stdout.includes("SAFE"),
  },
];

async function waitForTerminal(
  executor: SandboxExecutor,
  executionId: string,
): Promise<SandboxExecutionResult> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const result = await executor.getExecution(executionId);
    if (TERMINAL.has(result.status)) return result;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await executor.cancelExecution(executionId);
  throw new Error(`Sandbox security probe timed out: ${executionId}`);
}

export async function runSandboxSecurityCapabilityProbe(
  executor: SandboxExecutor,
) {
  if (executor.transport !== "REMOTE") {
    throw new Error(
      "Security capability probes require a remote sandbox executor",
    );
  }
  const submitted = await Promise.all(
    probes.map(async (probe) => {
      const request: SandboxExecutionRequest = {
        requestId: randomUUID(),
        language: "PYTHON",
        sourceCode: probe.sourceCode,
        stdin: "",
        networkAccess: false,
        limits: constrainedLimits,
        metadata: { purpose: "SECURITY_PROBE" },
      };
      const receipt = await executor.submitExecution(request);
      return { probe, receipt };
    }),
  );
  const results = await Promise.all(
    submitted.map(async ({ probe, receipt }) => {
      const result = await waitForTerminal(executor, receipt.executionId);
      return {
        name: probe.name,
        passed: probe.verify(result),
        executionId: result.executionId,
        executorVersion: result.executorVersion,
        status: result.status,
        errorType: result.errorType,
        resourceUsage: result.resourceUsage,
      };
    }),
  );
  return {
    verifiedAt: new Date().toISOString(),
    passed: results.every((result) => result.passed),
    results,
  };
}
