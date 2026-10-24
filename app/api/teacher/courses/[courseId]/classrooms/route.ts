import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { createClassroomSchema } from "@/services/classrooms/schemas";
import { createCourseClassroom } from "@/services/courses/classroom-creation";
import { courseIdSchema } from "@/services/courses/schemas";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const courseId = courseIdSchema.safeParse((await context.params).courseId);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const input = createClassroomSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success) {
      return apiError(
        "请检查班级信息",
        400,
        definedFieldErrors(input.error.flatten().fieldErrors),
      );
    }
    return apiSuccess(
      await createCourseClassroom(
        teacher.id,
        courseId.data,
        input.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return courseApiError(error);
  }
}
