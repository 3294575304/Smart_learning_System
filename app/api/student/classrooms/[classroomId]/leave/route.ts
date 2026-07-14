import { Role } from "@prisma/client";

import { classroomApiError } from "@/lib/classroom-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { classroomIdSchema } from "@/services/classrooms/schemas";
import { leaveClassroom } from "@/services/classrooms/service";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const parsedId = classroomIdSchema.safeParse(
    (await context.params).classroomId,
  );
  if (!parsedId.success) {
    return apiError("班级 ID 格式无效", 400);
  }

  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await leaveClassroom(student.id, parsedId.data));
  } catch (error: unknown) {
    return classroomApiError(error);
  }
}
