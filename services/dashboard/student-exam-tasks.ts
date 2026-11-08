import "server-only";
import { prisma } from "@/lib/prisma";
import { studentTaskHref } from "@/services/student-experience/task-scope";
import { publishedResultsWhere } from "@/services/assignments/work-access";
import { EFFECTIVE_SUBMISSION_STATUSES } from "@/services/assignments/reporting";
import type { StudentTaskItem } from "./student-task-overview";

export async function getStudentExamTasks(
  studentId: string,
  now: Date,
  scope?: { courseId: string; classroomId: string },
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
  const scheduled = [];
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
    const item = {
      id: `exam:${assignment.id}`,
      kind: "exam" as const,
      title: exam.title,
      courseName: exam.course.name,
      classroomName: assignment.classroom.name,
      dueAt,
      href: studentTaskHref(`/student/assignments/${assignment.id}`, {
        courseId: exam.courseId,
        classroomId: assignment.classroomId,
      }),
      action: "查看考试",
      state: "考试中",
    };
    if (opensAt > now)
      scheduled.push({
        ...item,
        opensAt,
        state: "待开考",
        href: `/student/exams#exam-${assignment.id}`,
      });
    else items.push(item);
  }
  scheduled.sort(
    (a, b) =>
      a.opensAt.getTime() - b.opensAt.getTime() || a.id.localeCompare(b.id),
  );
  return { items, scheduled };
}
