import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema, updateCourseSchema } from "@/services/courses/schemas";
import {
  deleteTeacherCourse,
  getTeacherCourse,
  updateTeacherCourse,
} from "@/services/courses/service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    return apiError("课程 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await getTeacherCourse(teacher.id, parsedId.data));
  } catch (error: unknown) {
    return courseApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const parsedId = courseIdSchema.safeParse(courseId);
  const body: unknown = await request.json().catch(() => null);
  const parsedInput = updateCourseSchema.safeParse(body);

  if (!parsedId.success) {
    return apiError("课程 ID 格式无效", 400);
  }
  if (!parsedInput.success) {
    return apiError(
      "请检查课程信息",
      400,
      definedFieldErrors(parsedInput.error.flatten().fieldErrors),
    );
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await updateTeacherCourse(
        teacher.id,
        parsedId.data,
        parsedInput.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    return apiError("课程 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await deleteTeacherCourse(
        teacher.id,
        parsedId.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}
