import "server-only";
import { prisma } from "@/lib/prisma";
import { submitStudentAssignment } from "@/services/assignments/service";

/** Bounded, idempotent sweep; the existing long-task worker invokes this each recovery cycle. */
export async function finalizeExpiredExams(now = new Date()) {
  const due = await prisma.submission.findMany({
    where: {
      status: "IN_PROGRESS",
      assignment: { examSession: { cancelledAt: null, endsAt: { lte: now } } },
    },
    select: { id: true, studentId: true },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  let completed = 0;
  for (const item of due) {
    try {
      await submitStudentAssignment(item.studentId, item.id, "EXAM_AUTO");
      completed += 1;
    } catch (error) {
      console.error("Exam auto-submit failed", {
        submissionId: item.id,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return completed;
}
