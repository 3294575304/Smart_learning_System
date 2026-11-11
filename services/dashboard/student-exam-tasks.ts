import "server-only";
import { prisma } from "@/lib/prisma";
import { activityHref } from "@/services/student-experience/activity-query";
import { studentTaskHref } from "@/services/student-experience/task-scope";
import { publishedResultsWhere } from "@/services/assignments/work-access";
import { EFFECTIVE_SUBMISSION_STATUSES } from "@/services/assignments/reporting";
import type { StudentTaskItem } from "./student-task-overview";

export async function getStudentExamTasks(
  studentId: string,
  now: Date,
  scope?: { courseId?: string; classroomId?: string },
) {
  const assignments = await prisma.assignment.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      ...(scope ? { classroomId: scope.classroomId } : {}),
      examSession: { cancelledAt: null, endsAt: { gt: now } },
      dueAt: { gt: now },
      classroom: {
        status: "ACTIVE",
        ...(scope ? { courseId: scope.courseId } : {}),
        memberships: { some: { studentId, status: "ACTIVE" } },
      },
      AND: [
        {
          submissions: {
            none: { studentId, status: { in: EFFECTIVE_SUBMISSION_STATUSES } },
          },
        },
        { submissions: { none: publishedResultsWhere } },
      ],
    },
    select: {
      id: true,
      publishedAt: true,
      dueAt: true,
      classroomId: true,
      examSession: {
        select: {
          title: true,
          startsAt: true,
          endsAt: true,
          courseId: true,
          course: { select: { name: true } },
        },
      },
      classroom: { select: { name: true, courseId: true } },
    },
  });
  const items: StudentTaskItem[] = [];
  for (const assignment of assignments) {
    const exam = assignment.examSession;
    if (
      !exam ||
      !assignment.publishedAt ||
      !assignment.dueAt ||
      exam.courseId !== assignment.classroom.courseId
    )
      continue;
    const opensAt = new Date(
      Math.max(exam.startsAt.getTime(), assignment.publishedAt.getTime()),
    );
    const dueAt = new Date(
      Math.min(exam.endsAt.getTime(), assignment.dueAt.getTime()),
    );
    if (dueAt <= opensAt) continue;
    const canEnter = opensAt <= now;
    const scope = {
      courseId: exam.courseId,
      classroomId: assignment.classroomId,
    };
    items.push({
      id: `exam:${assignment.id}`,
      kind: "exam",
      status: canEnter ? "TODO" : "UPCOMING",
      title: exam.title,
      courseName: exam.course.name,
      classroomName: assignment.classroom.name,
      opensAt,
      dueAt,
      canEnter,
      attemptLimit: 1,
      windowMinutes: Math.ceil((dueAt.getTime() - opensAt.getTime()) / 60000),
      href: canEnter
        ? studentTaskHref(`/student/assignments/${assignment.id}`, scope)
        : `${activityHref("exams", { ...scope, focus: assignment.id })}#exam-${assignment.id}`,
      action: canEnter ? "进入考试" : "查看安排",
      state: canEnter ? "考试中" : "待开考",
    });
  }
  return items.sort(
    (a, b) =>
      (a.opensAt?.getTime() ?? 0) - (b.opensAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
}
