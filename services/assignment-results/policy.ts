import { ResourceNotFoundError } from "@/services/auth/policy";

export function assertTeacherOwnsAssignment(
  teacherId: string,
  assignment: { teacherId: string } | null,
): asserts assignment is { teacherId: string } {
  if (!assignment || assignment.teacherId !== teacherId) {
    throw new ResourceNotFoundError("作业不存在");
  }
}
