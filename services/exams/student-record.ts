import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { EFFECTIVE_SUBMISSION_STATUSES } from "@/services/assignments/reporting";

export async function getStudentExamRecord(
  studentId: string,
  examId: string,
  scope: { courseId?: string; classroomId?: string },
) {
  const rows = await prisma.assignment.findMany({
    where: {
      deletedAt: null,
      status: { in: ["PUBLISHED", "CLOSED"] },
      classroomId: scope.classroomId,
      classroom: {
        courseId: scope.courseId,
        memberships: { some: { studentId, status: "ACTIVE" } },
      },
      examSession: { id: examId, cancelledAt: null, courseId: scope.courseId },
    },
    take: 2,
    select: {
      id: true,
      publishedAt: true,
      dueAt: true,
      classroomId: true,
      classroom: { select: { name: true, courseId: true } },
      examSession: {
        select: {
          id: true,
          title: true,
          courseId: true,
          startsAt: true,
          endsAt: true,
          type: true,
          course: { select: { name: true } },
        },
      },
      submissions: {
        where: {
          studentId,
          status: { in: [...EFFECTIVE_SUBMISSION_STATUSES, "IN_PROGRESS"] },
        },
        orderBy: [{ attemptNumber: "desc" }, { id: "asc" }],
        select: {
          id: true,
          status: true,
          submittedAt: true,
          lastSavedAt: true,
          examSubmissionReason: true,
        },
        take: 1,
      },
    },
  });
  const row = rows.length === 1 ? rows[0] : undefined;
  if (!row?.examSession || row.classroom.courseId !== row.examSession.courseId)
    throw new ResourceNotFoundError("考试不存在或需要指定教学班");
  return {
    ...row,
    exam: row.examSession,
    startsAt: new Date(
      Math.max(
        row.examSession.startsAt.getTime(),
        row.publishedAt?.getTime() ?? 0,
      ),
    ),
    dueAt: new Date(
      Math.min(
        row.examSession.endsAt.getTime(),
        row.dueAt?.getTime() ?? Infinity,
      ),
    ),
    submission: row.submissions[0] ?? null,
  };
}
