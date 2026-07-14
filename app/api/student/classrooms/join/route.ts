import { Role } from "@prisma/client";

import { classroomApiError } from "@/lib/classroom-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { joinClassroomSchema } from "@/services/classrooms/schemas";
import { joinClassroom } from "@/services/classrooms/service";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = joinClassroomSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "请检查邀请码",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }

  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await joinClassroom(student.id, parsed.data.joinCode),
      201,
    );
  } catch (error: unknown) {
    return classroomApiError(error);
  }
}
