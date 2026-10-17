import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { listLearningConversations } from "@/services/learning-assistant/history";
import { learningHistoryQuerySchema } from "@/services/learning-assistant/schemas";
import { learningAssistantRequestSchema } from "@/services/learning-assistant/schemas";
import { askCourseLearningAssistant } from "@/services/learning-assistant/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const courseId = courseIdSchema.safeParse((await context.params).courseId);
    const input = learningAssistantRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!courseId.success || !input.success)
      return apiError("请选择课程主题并检查问题内容（最多 2000 字）", 400);
    return apiSuccess(
      await askCourseLearningAssistant(student.id, courseId.data, input.data),
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const courseId = courseIdSchema.safeParse((await context.params).courseId);
    const query = learningHistoryQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!courseId.success || !query.success)
      return apiError("对话查询条件无效", 400);
    return apiSuccess(
      await listLearningConversations(
        student.id,
        courseId.data,
        query.data.page,
      ),
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
