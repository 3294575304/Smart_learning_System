import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { questionGraphBindingApiError } from "@/lib/question-graph-binding-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { bindableNodePathSchema } from "@/services/question-graph-bindings/schemas";
import { getGraphQuestionCoverage } from "@/services/question-graph-bindings/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const path = bindableNodePathSchema.safeParse(await context.params);
    if (!path.success) return apiError("课程 ID 格式无效", 400);
    return apiSuccess(
      await getGraphQuestionCoverage(teacher.id, path.data.courseId),
    );
  } catch (error) {
    return questionGraphBindingApiError(error);
  }
}
