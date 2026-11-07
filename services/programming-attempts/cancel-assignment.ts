import "server-only";
import type { Prisma } from "@prisma/client";

export async function cancelAssignmentProgrammingJobs(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  now: Date,
) {
  const attemptScope = {
    assignmentQuestion: { assignmentId },
    status: { in: ["PENDING", "RUNNING"] },
  } satisfies Prisma.ProgrammingAttemptWhereInput;
  const active = await tx.programmingAttempt.findMany({
    where: attemptScope,
    select: { backgroundJobId: true },
  });
  if (!active.length) return;
  const ids = active.flatMap(({ backgroundJobId }) =>
    backgroundJobId ? [backgroundJobId] : [],
  );
  await tx.backgroundJobAttempt.updateMany({
    where: { jobId: { in: ids }, completedAt: null },
    data: {
      completedAt: now,
      heartbeatAt: now,
      errorCode: "CANCELLED",
      retryable: false,
    },
  });
  await tx.backgroundJob.updateMany({
    where: { id: { in: ids }, status: { in: ["PENDING", "RUNNING"] } },
    data: {
      status: "CANCELLED",
      currentLeaseId: null,
      cancelRequestedAt: now,
      completedAt: now,
      errorCode: "CANCELLED",
      retryable: false,
    },
  });
  await tx.programmingAttempt.updateMany({
    where: attemptScope,
    data: {
      status: "CANCELLED",
      overallErrorType: "CANCELLED",
      safeErrorSummary: "作业已撤销",
      completedAt: now,
    },
  });
}
