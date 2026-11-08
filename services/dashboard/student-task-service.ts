import { getStudentExamTasks } from "./student-exam-tasks";
import "server-only";

import { getStudentClassroomContext } from "@/services/courses/student-access";
import { studentTaskScopeSchema } from "@/services/student-experience/task-scope";
import { prisma } from "@/lib/prisma";
import { listStudentPendingAssignments } from "@/services/assignments/service";
import { getStudentHomeTasks } from "./student-home-tasks";
import {
  pendingStudentAssignments,
  summarizeStudentTasks,
} from "./student-task-overview";

export async function getStudentTaskOverview(
  studentId: string,
  now = new Date(),
  classScope?: { courseId: string; classroomId: string },
) {
  const scope =
    classScope === undefined
      ? undefined
      : studentTaskScopeSchema.required().strict().parse(classScope);
  if (scope) {
    const classroom = await getStudentClassroomContext(
      studentId,
      scope.classroomId,
      scope.courseId,
    );
    if (classroom.status !== "ACTIVE")
      return summarizeStudentTasks(
        { assignments: [], contexts: [], attendance: [], surveys: [] },
        now,
      );
  }
  const [assignments, home, exams] = await Promise.all([
    listStudentPendingAssignments(
      studentId,
      now,
      scope?.courseId,
      scope?.classroomId,
    ),
    getStudentHomeTasks(studentId, now, scope),
    getStudentExamTasks(studentId, now, scope),
  ]);
  const pending = pendingStudentAssignments(assignments, now);
  // Load display context in one batch, with current membership and class state.
  // Task eligibility and personalized deadlines remain owned by the assignment service.
  const contexts = pending.length
    ? await prisma.assignment.findMany({
        where: {
          ...(scope ? { classroomId: scope.classroomId } : {}),
          id: { in: pending.map((item) => item.id) },
          status: "PUBLISHED",
          publishedAt: { lte: now },
          classroom: {
            ...(scope ? { courseId: scope.courseId } : {}),
            status: "ACTIVE",
            memberships: { some: { studentId, status: "ACTIVE" } },
          },
        },
        select: {
          id: true,
          classroomId: true,
          classroom: {
            select: {
              name: true,
              course: { select: { id: true, name: true } },
            },
          },
        },
      })
    : [];
  return summarizeStudentTasks(
    {
      assignments,
      contexts,
      exams: exams.items,
      scheduledExams: exams.scheduled,
      attendance: home.attendance,
      surveys: [...home.surveys, ...home.scheduledSurveys],
    },
    now,
  );
}
