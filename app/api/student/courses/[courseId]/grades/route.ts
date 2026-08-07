import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { gradebookApiError } from "@/lib/gradebook-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getStudentPublishedCourseGrades } from "@/services/gradebook/service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const courseId = courseIdSchema.safeParse((await context.params).courseId);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await getStudentPublishedCourseGrades(student.id, courseId.data),
    );
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}
