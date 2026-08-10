import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  executionRequestFingerprint,
  validateExecutionRequest,
} from "../../services/sandbox-executor-server/src/contract";
import {
  classifySandboxOutcome,
  cpuUlimit,
  parseDockerBytes,
  positiveMeasuredValue,
} from "../../services/sandbox-executor-server/src/runner";

const validRequest = {
  requestId: "1eb5fcd2-82d6-42eb-8905-93c9ce642eb7",
  language: "PYTHON",
  sourceCode: "print('ok')",
  stdin: "",
  networkAccess: false,
  limits: {
    cpuTimeMs: 500,
    wallTimeMs: 1_500,
    memoryBytes: 32 * 1024 * 1024,
    outputBytes: 8 * 1024,
    processCount: 2,
  },
  metadata: { purpose: "SECURITY_PROBE" },
};

test("executor server validates the application request contract strictly", () => {
  assert.ok(validateExecutionRequest(validRequest));
  assert.equal(
    validateExecutionRequest({ ...validRequest, networkAccess: true }),
    null,
  );
  assert.equal(
    validateExecutionRequest({ ...validRequest, unexpected: "field" }),
    null,
  );
});

test("executor preserves container stdin for programming test cases", async () => {
  const source = await readFile(
    new URL(
      "../../services/sandbox-executor-server/src/runner.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    source,
    /"create",\s*"--name",\s*containerName,\s*"--interactive"/u,
  );
  assert.match(
    source,
    /\["start",\s*"--attach",\s*"--interactive",\s*containerName\]/u,
  );
  assert.match(source, /child\.stdin\.end\(request\.stdin\)/u);
});

test("executor request fingerprints do not depend on JSON property order", () => {
  const first = validateExecutionRequest(validRequest);
  const second = validateExecutionRequest({
    metadata: validRequest.metadata,
    limits: validRequest.limits,
    networkAccess: false,
    sourceCode: validRequest.sourceCode,
    stdin: validRequest.stdin,
    language: "PYTHON",
    requestId: validRequest.requestId,
  });
  assert.ok(first);
  assert.ok(second);
  assert.equal(
    executionRequestFingerprint(first),
    executionRequestFingerprint(second),
  );
});

test("executor classifies bounded resource failures before runtime errors", () => {
  assert.equal(
    classifySandboxOutcome({
      cancelled: false,
      timedOut: false,
      outputLimited: false,
      oomKilled: true,
      exitCode: 137,
      stderr: "",
      peakProcessCount: 1,
      processLimit: 2,
    }),
    "MEMORY_LIMIT",
  );
  assert.equal(
    classifySandboxOutcome({
      cancelled: false,
      timedOut: false,
      outputLimited: false,
      oomKilled: false,
      exitCode: 1,
      stderr: "BlockingIOError: Resource temporarily unavailable",
      peakProcessCount: 2,
      processLimit: 2,
    }),
    "PROCESS_LIMIT",
  );
  assert.equal(
    classifySandboxOutcome({
      cancelled: false,
      timedOut: false,
      outputLimited: false,
      oomKilled: false,
      exitCode: 2,
      stderr: "Traceback (most recent call last):\n",
      peakProcessCount: null,
      processLimit: 2,
    }),
    "PROCESS_LIMIT",
  );
  assert.equal(parseDockerBytes("1.5MiB"), 1.5 * 1024 * 1024);
});

test("executor distinguishes an early OOM-style kill from a wall timeout", () => {
  assert.equal(cpuUlimit(500), "1:2");
  assert.equal(cpuUlimit(1_500), "2:3");
  assert.equal(
    classifySandboxOutcome({
      cancelled: false,
      timedOut: false,
      outputLimited: false,
      oomKilled: false,
      exitCode: 137,
      stderr: "",
      peakProcessCount: 1,
      processLimit: 2,
    }),
    "MEMORY_LIMIT",
  );
  assert.equal(
    classifySandboxOutcome({
      cancelled: false,
      timedOut: true,
      outputLimited: false,
      oomKilled: false,
      exitCode: 137,
      stderr: "",
      peakProcessCount: 1,
      processLimit: 2,
    }),
    "TIME_LIMIT",
  );
});

test("unavailable resource samples remain null instead of looking like zero", () => {
  assert.equal(parseDockerBytes(""), null);
  assert.equal(positiveMeasuredValue(0), null);
  assert.equal(positiveMeasuredValue(Number.NaN), null);
  assert.equal(positiveMeasuredValue(1), 1);
  assert.equal(
    classifySandboxOutcome({
      cancelled: false,
      timedOut: false,
      outputLimited: false,
      oomKilled: false,
      exitCode: 0,
      stderr: "",
      peakProcessCount: null,
      processLimit: 2,
    }),
    "NONE",
  );
});
