import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizedInternalExecutionResult,
  studentVisibleExecutionResult,
} from "../../services/sandbox-executor/redaction";
import {
  sandboxExecutionRequestSchema,
  sandboxExecutionResultSchema,
} from "../../services/sandbox-executor/schemas";

test("executor requests require disabled network and bounded resources", () => {
  const base = {
    requestId: "1eb5fcd2-82d6-42eb-8905-93c9ce642eb7",
    language: "PYTHON",
    sourceCode: "print('ok')",
    stdin: "",
    networkAccess: false,
    limits: {
      cpuTimeMs: 500,
      wallTimeMs: 1_000,
      memoryBytes: 32 * 1024 * 1024,
      outputBytes: 8_192,
      processCount: 2,
    },
    metadata: { purpose: "SECURITY_PROBE" },
  };
  assert.equal(sandboxExecutionRequestSchema.safeParse(base).success, true);
  assert.equal(
    sandboxExecutionRequestSchema.safeParse({ ...base, networkAccess: true })
      .success,
    false,
  );
  assert.equal(
    sandboxExecutionRequestSchema.safeParse({
      ...base,
      limits: { ...base.limits, processCount: 1_000 },
    }).success,
    false,
  );
});

test("student result DTO removes hidden tests and bounds output", () => {
  const result = sandboxExecutionResultSchema.parse({
    executionId: "execution-1",
    status: "FAILED",
    executorVersion: "executor-v1",
    errorType: "RUNTIME_ERROR",
    exitCode: 1,
    stdout: "x".repeat(20_000),
    stderr: "runtime error",
    resourceUsage: {
      cpuTimeMs: 10,
      wallTimeMs: 20,
      peakMemoryBytes: 1_000,
      outputBytes: 20_000,
      processCount: 1,
    },
    tests: [
      {
        testId: "sample-1",
        visibility: "PUBLIC",
        passed: true,
        errorType: "NONE",
        stdout: "ok",
        stderr: "",
      },
      {
        testId: "hidden-secret-input",
        visibility: "HIDDEN",
        passed: false,
        errorType: "RUNTIME_ERROR",
        stdout: "secret expected output",
        stderr: "secret input",
      },
    ],
  });
  const visible = studentVisibleExecutionResult(result);
  const internal = sanitizedInternalExecutionResult(result);
  assert.equal(visible.tests.length, 1);
  assert.equal(visible.tests[0]?.testId, "sample-1");
  assert.equal(JSON.stringify(visible).includes("hidden-secret-input"), false);
  assert.equal(JSON.stringify(visible).includes("secret input"), false);
  assert.equal(visible.stdout.length, 16_384);
  assert.equal(internal.tests[1]?.stdout, "");
  assert.equal(internal.tests[1]?.stderr, "");
});
