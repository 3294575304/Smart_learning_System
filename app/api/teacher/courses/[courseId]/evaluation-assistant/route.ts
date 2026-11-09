import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { resolveTeacherEvaluationAction } from "@/services/course-analytics/evaluation-assistant";
import { evaluationAssistantRequestSchema } from "@/services/course-analytics/evaluation-assistant-schemas";
import { courseIdSchema } from "@/services/courses/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const courseId = courseIdSchema.safeParse((await context.params).courseId);
    const input = evaluationAssistantRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!courseId.success || !input.success)
      return apiError("请检查课程、班级和操作说明（最多 240 字）。", 400);
    const result = await resolveTeacherEvaluationAction(
      teacher.id,
      courseId.data,
      input.data,
    );
    return apiSuccess(result, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return recommendationApiError(error);
  }
}
