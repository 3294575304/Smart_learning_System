import { getStudentExamTasks } from "./student-exam-tasks";
import "server-only";

import { cache } from "react";

import { getStudentClassroomContext } from "@/services/courses/student-access";
import {
  studentTaskScopeSchema,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";
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
  classScope?: StudentTaskScope,
) {
  const scope =
    classScope === undefined
      ? undefined
      : studentTaskScopeSchema.strict().parse(classScope);
  if (scope?.classroomId) {
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
      exams,
      attendance: home.attendance,
      surveys: [...home.surveys, ...home.scheduledSurveys],
    },
    now,
  );
}

/**
 * 页面与外壳在同一请求里都要这份统计（正文用明细、侧栏用待办数做徽标）。
 * React 的 cache 以参数相等为命中条件，所以两边都传"取整到分钟"的毫秒数，
 * 既共用同一次查询，又不会因为两次 new Date() 不同而各查一遍。
 */
export const getStudentTaskOverviewShared = cache(
  async (studentId: string, nowMs: number) =>
    getStudentTaskOverview(studentId, new Date(nowMs)),
);

export function sharedNowMs() {
  return Math.floor(Date.now() / 60_000) * 60_000;
}
