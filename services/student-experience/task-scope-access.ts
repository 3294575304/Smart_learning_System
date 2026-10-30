import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import type { StudentTaskScope } from "./task-scope";

// The caller first authorizes the assignment/submission for the student.
// Navigation context must also match that resource, including historical results.
export async function assertAssignmentTaskScope(
  assignmentId: string,
  scope: StudentTaskScope,
) {
  if (!scope.courseId && !scope.classroomId) return;
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      ...(scope.classroomId ? { classroomId: scope.classroomId } : {}),
      ...(scope.courseId ? { classroom: { courseId: scope.courseId } } : {}),
    },
    select: { id: true },
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");
}
