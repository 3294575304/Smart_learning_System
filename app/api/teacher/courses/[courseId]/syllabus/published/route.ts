import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { syllabusParseApiError } from "@/lib/syllabus-parse-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherPublishedSyllabi } from "@/services/syllabus-parsing/review-service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const parsed = courseIdSchema.safeParse(courseId);
  if (!parsed.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getTeacherPublishedSyllabi(teacher.id, parsed.data),
    );
  } catch (error: unknown) {
    return syllabusParseApiError(error);
  }
}
