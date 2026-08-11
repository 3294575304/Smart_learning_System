import assert from "node:assert/strict";
import test from "node:test";

import { programmingExecutionRequestId } from "../../services/programming-judge-worker/src/worker";

const fingerprint = "a".repeat(64);
const testCaseId = "cmsoexampletestcase000000001";

test("programming execution request IDs remain stable within one background job", () => {
  const jobId = "cmsoexamplejob0000000000001";

  assert.equal(
    programmingExecutionRequestId(jobId, fingerprint, testCaseId),
    programmingExecutionRequestId(jobId, fingerprint, testCaseId),
  );
});

test("programming execution request IDs isolate separate background jobs", () => {
  assert.notEqual(
    programmingExecutionRequestId(
      "cmsoexamplejob0000000000001",
      fingerprint,
      testCaseId,
    ),
    programmingExecutionRequestId(
      "cmsoexamplejob0000000000002",
      fingerprint,
      testCaseId,
    ),
  );
});
