import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { createCourseSchema } from "@/services/courses/schemas";
import {
  createTeacherCourse,
  listTeacherCourses,
} from "@/services/courses/service";

export async function GET() {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listTeacherCourses(teacher.id));
  } catch (error: unknown) {
    return courseApiError(error);
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = createCourseSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      "请检查课程信息",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await createTeacherCourse(
        teacher.id,
        parsed.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}
