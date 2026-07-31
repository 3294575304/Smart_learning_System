import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { classroomApiError } from "@/lib/classroom-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  classroomIdSchema,
  updateClassroomSchema,
} from "@/services/classrooms/schemas";
import {
  dissolveTeacherClassroom,
  getTeacherClassroom,
  updateClassroom,
} from "@/services/classrooms/service";

interface TeacherClassroomRouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function DELETE(
  request: Request,
  context: TeacherClassroomRouteContext,
) {
  const parsedId = classroomIdSchema.safeParse(
    (await context.params).classroomId,
  );
  if (!parsedId.success) {
    return apiError("班级 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await dissolveTeacherClassroom(
        teacher.id,
        parsedId.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return classroomApiError(error);
  }
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
    const classroom = await getTeacherClassroom(teacher.id, parsedId.data);
    return apiSuccess(classroom);
  } catch (error: unknown) {
    return classroomApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: TeacherClassroomRouteContext,
) {
  const { classroomId } = await context.params;
  const parsedId = classroomIdSchema.safeParse(classroomId);
  const body: unknown = await request.json().catch(() => null);
  const parsedInput = updateClassroomSchema.safeParse(body);

  if (!parsedId.success) {
    return apiError("班级 ID 格式无效", 400);
  }
  if (!parsedInput.success) {
    return apiError(
      "请检查班级信息",
      400,
      definedFieldErrors(parsedInput.error.flatten().fieldErrors),
    );
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const classroom = await updateClassroom(
      teacher.id,
      parsedId.data,
      parsedInput.data,
    );
    return apiSuccess(classroom);
  } catch (error: unknown) {
    return classroomApiError(error);
  }
}
