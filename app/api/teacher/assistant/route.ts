import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { resolveTeacherAssistant } from "@/services/course-analytics/teacher-assistant";
import { teacherAssistantRequestSchema } from "@/services/course-analytics/teacher-assistant-schemas";

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const input = teacherAssistantRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success)
      return apiError("检查问题和课程选择后重试，问题最多 240 字。", 400);
    return apiSuccess(
      await resolveTeacherAssistant(teacher.id, input.data),
      200,
      {
        "Cache-Control": "private, no-store",
      },
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
