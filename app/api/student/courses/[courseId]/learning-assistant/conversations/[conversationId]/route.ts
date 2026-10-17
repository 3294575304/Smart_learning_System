import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  getLearningConversation,
  deleteLearningConversation,
} from "@/services/learning-assistant/history";
const paramsSchema = z.object({
  courseId: courseIdSchema,
  conversationId: z.string().min(1).max(128),
});
type Context = {
  params: Promise<{ courseId: string; conversationId: string }>;
};
async function handle(context: Context, remove: boolean) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return apiError("对话参数无效", 400);
    const { courseId, conversationId } = params.data;
    return apiSuccess(
      remove
        ? await deleteLearningConversation(student.id, courseId, conversationId)
        : await getLearningConversation(student.id, courseId, conversationId),
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
export async function GET(_request: Request, context: Context) {
  return handle(context, false);
}
export async function DELETE(_request: Request, context: Context) {
  return handle(context, true);
}
