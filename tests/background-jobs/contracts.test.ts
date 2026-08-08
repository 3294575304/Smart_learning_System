import assert from "node:assert/strict";
import test from "node:test";

import { backgroundJobFingerprint } from "../../services/background-jobs/fingerprint";
import {
  claimBackgroundJobSchema,
  completeBackgroundJobSchema,
  createBackgroundJobSchema,
  heartbeatBackgroundJobSchema,
} from "../../services/background-jobs/schemas";

test("job input fingerprints are stable across object key order", () => {
  assert.equal(
    backgroundJobFingerprint({ b: 2, a: { d: 4, c: 3 } }),
    backgroundJobFingerprint({ a: { c: 3, d: 4 }, b: 2 }),
  );
  assert.notEqual(
    backgroundJobFingerprint({ courseId: "course-a" }),
    backgroundJobFingerprint({ courseId: "course-b" }),
  );
});

test("job contracts reject unsafe types, leases and progress", () => {
  assert.equal(
    createBackgroundJobSchema.safeParse({
      type: "sandbox capability probe",
      idempotencyKey: "probe-1",
      input: {},
    }).success,
    false,
  );
  assert.equal(
    claimBackgroundJobSchema.safeParse({
      workerId: "worker-1",
      executorVersion: "executor-v1",
      acceptedTypes: [],
      leaseDurationMs: 30_000,
    }).success,
    false,
  );
  assert.equal(
    heartbeatBackgroundJobSchema.safeParse({
      leaseId: "not-a-uuid",
      progress: 101,
    }).success,
    false,
  );
  assert.equal(
    completeBackgroundJobSchema.safeParse({
      leaseId: "5d6fbf48-ecb2-43d5-8433-5b0f68327849",
      result: { sourceCode: "must never be accepted by a result schema" },
    }).success,
    true,
  );
});
