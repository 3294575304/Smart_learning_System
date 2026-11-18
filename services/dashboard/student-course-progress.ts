import "server-only";
import { prisma } from "@/lib/prisma";
import {
  assignmentReportingWhere,
  EFFECTIVE_SUBMISSION_STATUSES,
} from "@/services/assignments/reporting";
import { listStudentCourseEvaluationContexts } from "@/services/gradebook/service";

export async function listStudentCourseProgress(
  studentId: string,
  now = new Date(),
) {
  const contexts = await listStudentCourseEvaluationContexts(studentId);
  if (!contexts.length) return [];

  const assignments = await prisma.assignment.findMany({
    where: {
      classroomId: { in: contexts.map(({ classroom }) => classroom.id) },
      deletedAt: null,
      examSessionId: null,
      ...assignmentReportingWhere("ALL", now),
    },
    select: {
      classroomId: true,
      submissions: {
        where: { studentId, status: { in: EFFECTIVE_SUBMISSION_STATUSES } },
        select: { id: true },
        take: 1,
      },
    },
  });

  const progressByClass = new Map<
    string,
    { total: number; submitted: number }
  >();
  for (const { classroomId, submissions } of assignments) {
    const progress = progressByClass.get(classroomId) ?? {
      total: 0,
      submitted: 0,
    };
    progress.total += 1;
    if (submissions.length) progress.submitted += 1;
    progressByClass.set(classroomId, progress);
  }

  return contexts.map((context) => ({
    ...context,
    assignmentProgress: progressByClass.get(context.classroom.id) ?? {
      total: 0,
      submitted: 0,
    },
  }));
}
