import "server-only";

import { randomUUID } from "node:crypto";

import { BackgroundJobStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  BACKGROUND_JOB_ERROR_CODES,
  BackgroundJobInputConflictError,
  BackgroundJobLeaseLostError,
} from "@/services/background-jobs/errors";
import { backgroundJobFingerprint } from "@/services/background-jobs/fingerprint";
import {
  claimBackgroundJobSchema,
  completeBackgroundJobSchema,
  createBackgroundJobSchema,
  failBackgroundJobSchema,
  heartbeatBackgroundJobSchema,
  type ClaimBackgroundJobInput,
  type CreateBackgroundJobInput,
} from "@/services/background-jobs/schemas";

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};

export async function createBackgroundJob(rawInput: CreateBackgroundJobInput) {
  const input = createBackgroundJobSchema.parse(rawInput);
  const inputFingerprint = backgroundJobFingerprint({
    requestedById: input.requestedById ?? null,
    courseId: input.courseId ?? null,
    maxAttempts: input.maxAttempts,
    input: input.input,
  });
  try {
    return await prisma.backgroundJob.create({
      data: {
        type: input.type,
        requestedById: input.requestedById ?? null,
        courseId: input.courseId ?? null,
        idempotencyKey: input.idempotencyKey,
        inputFingerprint,
        input: input.input as Prisma.InputJsonObject,
        maxAttempts: input.maxAttempts,
      },
    });
  } catch (error: unknown) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    const existing = await prisma.backgroundJob.findUnique({
      where: {
        type_idempotencyKey: {
          type: input.type,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!existing || existing.inputFingerprint !== inputFingerprint) {
      throw new BackgroundJobInputConflictError();
    }
    return existing;
  }
}

export async function claimNextBackgroundJob(
  rawInput: ClaimBackgroundJobInput,
) {
  const input = claimBackgroundJobSchema.parse(rawInput);
  for (let retry = 0; retry < 5; retry += 1) {
    try {
      const claimed = await prisma.$transaction(async (transaction) => {
        const now = new Date();
        const candidate = await transaction.backgroundJob.findFirst({
          where: {
            type: { in: input.acceptedTypes },
            status: BackgroundJobStatus.PENDING,
            currentLeaseId: null,
            nextAttemptAt: { lte: now },
          },
          orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        });
        if (!candidate || candidate.attemptCount >= candidate.maxAttempts) {
          return null;
        }
        const leaseId = randomUUID();
        const expiresAt = new Date(now.getTime() + input.leaseDurationMs);
        const nextAttemptNumber = candidate.attemptCount + 1;
        const updated = await transaction.backgroundJob.updateMany({
          where: {
            id: candidate.id,
            status: BackgroundJobStatus.PENDING,
            currentLeaseId: null,
            attemptCount: candidate.attemptCount,
            nextAttemptAt: { lte: now },
          },
          data: {
            status: BackgroundJobStatus.RUNNING,
            currentLeaseId: leaseId,
            attemptCount: nextAttemptNumber,
            progress: 0,
            startedAt: candidate.startedAt ?? now,
            errorCode: null,
            retryable: null,
          },
        });
        if (updated.count !== 1) return null;
        await transaction.backgroundJobAttempt.create({
          data: {
            jobId: candidate.id,
            attemptNumber: nextAttemptNumber,
            leaseId,
            workerId: input.workerId,
            executorVersion: input.executorVersion,
            startedAt: now,
            heartbeatAt: now,
            expiresAt,
          },
        });
        return transaction.backgroundJob.findUnique({
          where: { id: candidate.id },
          include: {
            attempts: { where: { leaseId }, take: 1 },
          },
        });
      }, SERIALIZABLE);
      if (claimed) return claimed;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        continue;
      }
      throw error;
    }
  }
  return null;
}

export async function claimBackgroundJobById(
  jobId: string,
  rawInput: ClaimBackgroundJobInput,
) {
  const input = claimBackgroundJobSchema.parse(rawInput);
  return prisma.$transaction(async (transaction) => {
    const now = new Date();
    const candidate = await transaction.backgroundJob.findFirst({
      where: {
        id: jobId,
        type: { in: input.acceptedTypes },
        status: BackgroundJobStatus.PENDING,
        currentLeaseId: null,
        nextAttemptAt: { lte: now },
      },
    });
    if (!candidate || candidate.attemptCount >= candidate.maxAttempts)
      return null;
    const leaseId = randomUUID();
    const expiresAt = new Date(now.getTime() + input.leaseDurationMs);
    const attemptNumber = candidate.attemptCount + 1;
    const updated = await transaction.backgroundJob.updateMany({
      where: {
        id: jobId,
        status: BackgroundJobStatus.PENDING,
        currentLeaseId: null,
        attemptCount: candidate.attemptCount,
      },
      data: {
        status: BackgroundJobStatus.RUNNING,
        currentLeaseId: leaseId,
        attemptCount: attemptNumber,
        progress: 0,
        startedAt: candidate.startedAt ?? now,
        errorCode: null,
        retryable: null,
      },
    });
    if (updated.count !== 1) return null;
    await transaction.backgroundJobAttempt.create({
      data: {
        jobId,
        attemptNumber,
        leaseId,
        workerId: input.workerId,
        executorVersion: input.executorVersion,
        startedAt: now,
        heartbeatAt: now,
        expiresAt,
      },
    });
    return transaction.backgroundJob.findUnique({
      where: { id: jobId },
      include: { attempts: { where: { leaseId }, take: 1 } },
    });
  }, SERIALIZABLE);
}

export async function heartbeatBackgroundJob(jobId: string, rawInput: unknown) {
  const input = heartbeatBackgroundJobSchema.parse(rawInput);
  return prisma.$transaction(async (transaction) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.leaseDurationMs);
    const attempt = await transaction.backgroundJobAttempt.updateMany({
      where: {
        jobId,
        leaseId: input.leaseId,
        completedAt: null,
        expiresAt: { gt: now },
      },
      data: { heartbeatAt: now, expiresAt },
    });
    if (attempt.count !== 1) throw new BackgroundJobLeaseLostError();
    const job = await transaction.backgroundJob.updateMany({
      where: {
        id: jobId,
        status: BackgroundJobStatus.RUNNING,
        currentLeaseId: input.leaseId,
      },
      data: { progress: input.progress },
    });
    if (job.count !== 1) throw new BackgroundJobLeaseLostError();
    return {
      jobId,
      leaseId: input.leaseId,
      progress: input.progress,
      expiresAt,
    };
  }, SERIALIZABLE);
}

export async function completeBackgroundJob<T>(
  jobId: string,
  rawInput: unknown,
  projectResult?: (
    transaction: Prisma.TransactionClient,
    job: { id: string; type: string; input: Prisma.JsonValue },
  ) => Promise<T>,
) {
  const input = completeBackgroundJobSchema.parse(rawInput);
  return prisma.$transaction(async (transaction) => {
    const now = new Date();
    const job = await transaction.backgroundJob.findFirst({
      where: {
        id: jobId,
        status: BackgroundJobStatus.RUNNING,
        currentLeaseId: input.leaseId,
        attempts: {
          some: {
            leaseId: input.leaseId,
            completedAt: null,
            expiresAt: { gt: now },
          },
        },
      },
      select: { id: true, type: true, input: true },
    });
    if (!job) throw new BackgroundJobLeaseLostError();
    const projected = projectResult
      ? await projectResult(transaction, job)
      : undefined;
    const attempt = await transaction.backgroundJobAttempt.updateMany({
      where: {
        jobId,
        leaseId: input.leaseId,
        completedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        completedAt: now,
        heartbeatAt: now,
        resourceUsage: input.resourceUsage as Prisma.InputJsonObject,
      },
    });
    if (attempt.count !== 1) throw new BackgroundJobLeaseLostError();
    const updated = await transaction.backgroundJob.updateMany({
      where: {
        id: jobId,
        status: BackgroundJobStatus.RUNNING,
        currentLeaseId: input.leaseId,
      },
      data: {
        status: BackgroundJobStatus.SUCCEEDED,
        progress: 100,
        currentLeaseId: null,
        result: input.result as Prisma.InputJsonObject,
        completedAt: now,
        errorCode: null,
        retryable: false,
      },
    });
    if (updated.count !== 1) throw new BackgroundJobLeaseLostError();
    return { jobId, projected };
  }, SERIALIZABLE);
}

export async function failBackgroundJob<T>(
  jobId: string,
  rawInput: unknown,
  projectFailure?: (
    transaction: Prisma.TransactionClient,
    job: { id: string; type: string; input: Prisma.JsonValue },
    willRetry: boolean,
  ) => Promise<T>,
) {
  const input = failBackgroundJobSchema.parse(rawInput);
  return prisma.$transaction(async (transaction) => {
    const now = new Date();
    const job = await transaction.backgroundJob.findFirst({
      where: {
        id: jobId,
        status: BackgroundJobStatus.RUNNING,
        currentLeaseId: input.leaseId,
      },
      select: {
        id: true,
        type: true,
        input: true,
        attemptCount: true,
        maxAttempts: true,
      },
    });
    if (!job) throw new BackgroundJobLeaseLostError();
    const willRetry = input.retryable && job.attemptCount < job.maxAttempts;
    const projected = projectFailure
      ? await projectFailure(transaction, job, willRetry)
      : undefined;
    const attempt = await transaction.backgroundJobAttempt.updateMany({
      where: {
        jobId,
        leaseId: input.leaseId,
        completedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        completedAt: now,
        heartbeatAt: now,
        errorCode: input.errorCode,
        retryable: input.retryable,
        resourceUsage: input.resourceUsage as Prisma.InputJsonObject,
      },
    });
    if (attempt.count !== 1) throw new BackgroundJobLeaseLostError();
    const nextAttemptAt = new Date(
      now.getTime() + Math.min(300_000, 1_000 * 2 ** (job.attemptCount - 1)),
    );
    const updated = await transaction.backgroundJob.updateMany({
      where: {
        id: jobId,
        status: BackgroundJobStatus.RUNNING,
        currentLeaseId: input.leaseId,
      },
      data: {
        status: willRetry
          ? BackgroundJobStatus.PENDING
          : BackgroundJobStatus.FAILED,
        currentLeaseId: null,
        errorCode: input.errorCode,
        retryable: input.retryable,
        nextAttemptAt: willRetry ? nextAttemptAt : now,
        completedAt: willRetry ? null : now,
      },
    });
    if (updated.count !== 1) throw new BackgroundJobLeaseLostError();
    return {
      jobId,
      willRetry,
      nextAttemptAt: willRetry ? nextAttemptAt : null,
      projected,
    };
  }, SERIALIZABLE);
}

export async function cancelBackgroundJob(jobId: string) {
  return prisma.$transaction(async (transaction) => {
    const now = new Date();
    const job = await transaction.backgroundJob.findFirst({
      where: {
        id: jobId,
        status: {
          in: [BackgroundJobStatus.PENDING, BackgroundJobStatus.RUNNING],
        },
      },
      select: { currentLeaseId: true },
    });
    if (!job) return { cancelled: false };
    if (job.currentLeaseId) {
      await transaction.backgroundJobAttempt.updateMany({
        where: {
          jobId,
          leaseId: job.currentLeaseId,
          completedAt: null,
        },
        data: {
          completedAt: now,
          heartbeatAt: now,
          errorCode: BACKGROUND_JOB_ERROR_CODES.CANCELLED,
          retryable: false,
        },
      });
    }
    const result = await transaction.backgroundJob.updateMany({
      where: {
        id: jobId,
        status: {
          in: [BackgroundJobStatus.PENDING, BackgroundJobStatus.RUNNING],
        },
      },
      data: {
        status: BackgroundJobStatus.CANCELLED,
        cancelRequestedAt: now,
        completedAt: now,
        currentLeaseId: null,
        errorCode: BACKGROUND_JOB_ERROR_CODES.CANCELLED,
        retryable: false,
      },
    });
    return { cancelled: result.count === 1 };
  }, SERIALIZABLE);
}

export async function recoverExpiredBackgroundJobs(limit = 100) {
  const now = new Date();
  const expired = await prisma.backgroundJobAttempt.findMany({
    where: {
      completedAt: null,
      expiresAt: { lte: now },
      job: { status: BackgroundJobStatus.RUNNING },
    },
    orderBy: { expiresAt: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
    select: { jobId: true, leaseId: true },
  });
  let recovered = 0;
  for (const attempt of expired) {
    try {
      await prisma.$transaction(async (transaction) => {
        const observedAt = new Date();
        const job = await transaction.backgroundJob.findFirst({
          where: {
            id: attempt.jobId,
            status: BackgroundJobStatus.RUNNING,
            currentLeaseId: attempt.leaseId,
            attempts: {
              some: {
                leaseId: attempt.leaseId,
                completedAt: null,
                expiresAt: { lte: observedAt },
              },
            },
          },
          select: { attemptCount: true, maxAttempts: true },
        });
        if (!job) throw new BackgroundJobLeaseLostError();
        const willRetry = job.attemptCount < job.maxAttempts;
        const closed = await transaction.backgroundJobAttempt.updateMany({
          where: {
            jobId: attempt.jobId,
            leaseId: attempt.leaseId,
            completedAt: null,
            expiresAt: { lte: observedAt },
          },
          data: {
            completedAt: observedAt,
            errorCode: BACKGROUND_JOB_ERROR_CODES.LEASE_EXPIRED,
            retryable: true,
          },
        });
        if (closed.count !== 1) throw new BackgroundJobLeaseLostError();
        const nextAttemptAt = new Date(
          observedAt.getTime() +
            Math.min(300_000, 1_000 * 2 ** (job.attemptCount - 1)),
        );
        const updated = await transaction.backgroundJob.updateMany({
          where: {
            id: attempt.jobId,
            status: BackgroundJobStatus.RUNNING,
            currentLeaseId: attempt.leaseId,
          },
          data: {
            status: willRetry
              ? BackgroundJobStatus.PENDING
              : BackgroundJobStatus.FAILED,
            currentLeaseId: null,
            errorCode: BACKGROUND_JOB_ERROR_CODES.LEASE_EXPIRED,
            retryable: true,
            nextAttemptAt: willRetry ? nextAttemptAt : observedAt,
            completedAt: willRetry ? null : observedAt,
          },
        });
        if (updated.count !== 1) throw new BackgroundJobLeaseLostError();
      }, SERIALIZABLE);
      recovered += 1;
    } catch (error: unknown) {
      if (!(error instanceof BackgroundJobLeaseLostError)) throw error;
    }
  }
  return { scanned: expired.length, recovered };
}
