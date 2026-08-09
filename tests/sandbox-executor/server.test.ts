import assert from "node:assert/strict";
import test from "node:test";

import {
  executionRequestFingerprint,
  validateExecutionRequest,
} from "../../services/sandbox-executor-server/src/contract";
import {
  classifySandboxOutcome,
  parseDockerBytes,
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
  assert.equal(parseDockerBytes("1.5MiB"), 1.5 * 1024 * 1024);
});

test("executor maps a non-OOM hard CPU kill to a time limit", () => {
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
    "TIME_LIMIT",
  );
});

test("unavailable resource samples remain null instead of looking like zero", () => {
  assert.equal(parseDockerBytes(""), null);
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
