import assert from "node:assert/strict";

import { BackgroundJobStatus, PrismaClient } from "@prisma/client";

import { POST as claimRoute } from "@/app/api/internal/background-jobs/claim/route";
import {
  BackgroundJobInputConflictError,
  BackgroundJobLeaseLostError,
} from "@/services/background-jobs/errors";
import {
  cancelBackgroundJob,
  claimNextBackgroundJob,
  completeBackgroundJob,
  createBackgroundJob,
  heartbeatBackgroundJob,
  recoverExpiredBackgroundJobs,
} from "@/services/background-jobs/repository";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();
const secret = "iteration-five-a-worker-secret-at-least-32-characters";
process.env.BACKGROUND_JOB_WORKER_SECRET = secret;

const claimInput = {
  workerId: "worker-integration-1",
  executorVersion: "executor-contract-v1",
  acceptedTypes: ["SANDBOX_CAPABILITY_PROBE"],
  leaseDurationMs: 30_000,
};

async function main() {
  const suffix = Date.now().toString(36);
  try {
    const created = await createBackgroundJob({
      type: "SANDBOX_CAPABILITY_PROBE",
      idempotencyKey: `job-${suffix}`,
      input: { probeSet: "security-v1" },
      maxAttempts: 3,
    });
    const reused = await createBackgroundJob({
      type: "SANDBOX_CAPABILITY_PROBE",
      idempotencyKey: `job-${suffix}`,
      input: { probeSet: "security-v1" },
      maxAttempts: 3,
    });
    assert.equal(reused.id, created.id);
    await assert.rejects(
      createBackgroundJob({
        type: "SANDBOX_CAPABILITY_PROBE",
        idempotencyKey: `job-${suffix}`,
        input: { probeSet: "different-input" },
        maxAttempts: 3,
      }),
      BackgroundJobInputConflictError,
    );

    const claims = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        claimNextBackgroundJob({
          ...claimInput,
          workerId: `concurrent-worker-${index}`,
        }),
      ),
    );
    const successfulClaims = claims.filter((claim) => claim !== null);
    assert.equal(successfulClaims.length, 1);
    const firstClaim = successfulClaims[0]!;
    const firstLease = firstClaim.currentLeaseId!;
    await heartbeatBackgroundJob(created.id, {
      leaseId: firstLease,
      progress: 25,
      leaseDurationMs: 30_000,
    });

    await prisma.backgroundJobAttempt.update({
      where: { leaseId: firstLease },
      data: {
        startedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const recovered = await recoverExpiredBackgroundJobs();
    assert.equal(recovered.recovered, 1);
    await prisma.backgroundJob.update({
      where: { id: created.id },
      data: { nextAttemptAt: new Date(Date.now() - 1) },
    });
    const secondClaim = await claimNextBackgroundJob({
      ...claimInput,
      workerId: "replacement-worker",
    });
    assert.equal(secondClaim?.id, created.id);
    assert.notEqual(secondClaim?.currentLeaseId, firstLease);
    await assert.rejects(
      completeBackgroundJob(created.id, {
        leaseId: firstLease,
        result: {},
        resourceUsage: {},
      }),
      BackgroundJobLeaseLostError,
    );

    const secondLease = secondClaim!.currentLeaseId!;
    await assert.rejects(
      completeBackgroundJob(
        created.id,
        { leaseId: secondLease, result: {}, resourceUsage: {} },
        async (transaction) => {
          await transaction.backgroundJob.update({
            where: { id: created.id },
            data: { progress: 77 },
          });
          throw new Error("projection failure");
        },
      ),
      /projection failure/,
    );
    const afterRollback = await prisma.backgroundJob.findUniqueOrThrow({
      where: { id: created.id },
    });
    assert.equal(afterRollback.status, BackgroundJobStatus.RUNNING);
    assert.equal(afterRollback.progress, 0);

    await completeBackgroundJob(created.id, {
      leaseId: secondLease,
      result: { passed: true },
      resourceUsage: { cpuTimeMs: 10 },
    });
    await assert.rejects(
      heartbeatBackgroundJob(created.id, {
        leaseId: secondLease,
        progress: 90,
        leaseDurationMs: 30_000,
      }),
      BackgroundJobLeaseLostError,
    );

    const cancellable = await createBackgroundJob({
      type: "SANDBOX_CAPABILITY_PROBE",
      idempotencyKey: `cancel-${suffix}`,
      input: { probeSet: "security-v1" },
      maxAttempts: 1,
    });
    const cancelClaim = await claimNextBackgroundJob({
      ...claimInput,
      workerId: "cancel-worker",
    });
    assert.equal(cancelClaim?.id, cancellable.id);
    assert.deepEqual(await cancelBackgroundJob(cancellable.id), {
      cancelled: true,
    });
    await assert.rejects(
      heartbeatBackgroundJob(cancellable.id, {
        leaseId: cancelClaim!.currentLeaseId!,
        progress: 50,
        leaseDurationMs: 30_000,
      }),
      BackgroundJobLeaseLostError,
    );

    const unauthenticated = await claimRoute(
      new Request("http://localhost/api/internal/background-jobs/claim", {
        method: "POST",
        body: JSON.stringify(claimInput),
      }),
    );
    assert.equal(unauthenticated.status, 401);
    const wrongSecret = await claimRoute(
      new Request("http://localhost/api/internal/background-jobs/claim", {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
        body: JSON.stringify(claimInput),
      }),
    );
    assert.equal(wrongSecret.status, 401);
    const authenticated = await claimRoute(
      new Request("http://localhost/api/internal/background-jobs/claim", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        body: JSON.stringify(claimInput),
      }),
    );
    assert.equal(authenticated.status, 200);

    console.log(
      "Background job integration passed: idempotency, concurrent claim, lease recovery, stale-worker rejection, rollback, cancellation, and worker authentication.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
});
