import "server-only";

import { prisma } from "@/lib/prisma";
import { listStudentAssignments } from "@/services/assignments/service";
import { getStudentHomeTasks } from "./student-home-tasks";
import {
  pendingStudentAssignments,
  summarizeStudentTasks,
} from "./student-task-overview";

export async function getStudentTaskOverview(studentId: string) {
  const now = new Date();
  const [assignments, home] = await Promise.all([
    listStudentAssignments(studentId),
    getStudentHomeTasks(studentId, now),
  ]);
  const pending = pendingStudentAssignments(assignments, now);
  // Load display context in one batch, with current membership and class state.
  // Task eligibility and personalized deadlines remain owned by the assignment service.
  const contexts = pending.length
    ? await prisma.assignment.findMany({
        where: {
          id: { in: pending.map((item) => item.id) },
          status: "PUBLISHED",
          publishedAt: { lte: now },
          classroom: {
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
      attendance: home.attendance,
      surveys: [...home.surveys, ...home.scheduledSurveys],
    },
    now,
  );
}
