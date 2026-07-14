import { Role } from "@prisma/client";

import { classroomApiError } from "@/lib/classroom-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { createClassroomSchema } from "@/services/classrooms/schemas";
import {
  createClassroom,
  listTeacherClassrooms,
} from "@/services/classrooms/service";

export async function GET() {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listTeacherClassrooms(teacher.id));
  } catch (error: unknown) {
    return classroomApiError(error);
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = createClassroomSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      "请检查班级信息",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const classroom = await createClassroom(teacher.id, parsed.data);
    return apiSuccess(classroom, 201);
  } catch (error: unknown) {
    return classroomApiError(error);
  }
}
