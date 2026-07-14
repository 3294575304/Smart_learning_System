import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import {
  getErrorStatus,
  getSafeErrorMessage,
  requireAuthenticatedUser,
} from "@/services/auth/authorization";
import { classroomIdSchema } from "@/services/auth/schemas";
import { getTeacherOwnedClassroom } from "@/services/classrooms/authorization";

interface TeacherClassroomRouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(
  _request: Request,
  context: TeacherClassroomRouteContext,
) {
  const { classroomId } = await context.params;
  const parsedId = classroomIdSchema.safeParse(classroomId);

  if (!parsedId.success) {
    return apiError("班级 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const classroom = await getTeacherOwnedClassroom(teacher.id, parsedId.data);
    return apiSuccess(classroom);
  } catch (error: unknown) {
    return apiError(getSafeErrorMessage(error), getErrorStatus(error));
  }
}
