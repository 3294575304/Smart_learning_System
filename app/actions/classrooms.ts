"use server";

import { Role } from "@prisma/client";

import {
  getErrorStatus,
  getSafeErrorMessage,
  requireAuthenticatedUser,
} from "@/services/auth/authorization";
import { classroomIdSchema } from "@/services/auth/schemas";
import {
  getTeacherOwnedClassroom,
  type TeacherClassroomSummary,
} from "@/services/classrooms/authorization";
import type { ActionResult } from "@/types/action-result";

export async function getTeacherClassroomAction(
  classroomId: string,
): Promise<ActionResult<TeacherClassroomSummary>> {
  const parsedId = classroomIdSchema.safeParse(classroomId);

  if (!parsedId.success) {
    return { success: false, error: "班级 ID 格式无效", status: 400 };
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const classroom = await getTeacherOwnedClassroom(teacher.id, parsedId.data);
    return { success: true, data: classroom };
  } catch (error: unknown) {
    return {
      success: false,
      error: getSafeErrorMessage(error),
      status: getErrorStatus(error),
    };
  }
}
