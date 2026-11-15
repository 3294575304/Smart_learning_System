import "server-only";

import { AuthorizationError } from "@/services/auth/policy";
import { prisma } from "@/lib/prisma";

export async function hasActiveExamAttempt(
  studentId: string,
  now = new Date(),
) {
  const attempt = await prisma.submission.findFirst({
    where: {
      studentId,
      status: "IN_PROGRESS",
      startedAt: { lte: now },
      submittedAt: null,
      assignment: {
        deletedAt: null,
        status: "PUBLISHED",
        examSession: {
          cancelledAt: null,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      },
    },
    select: { id: true },
  });
  return attempt !== null;
}

export async function assertLearningAssistantAvailable(studentId: string) {
  if (await hasActiveExamAttempt(studentId))
    throw new AuthorizationError("考试作答期间，课程答疑暂不可用。");
}
