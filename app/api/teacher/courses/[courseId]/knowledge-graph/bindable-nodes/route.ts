import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { questionGraphBindingApiError } from "@/lib/question-graph-binding-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  bindableNodePathSchema,
  bindableNodeQuerySchema,
} from "@/services/question-graph-bindings/schemas";
import { listBindableNodes } from "@/services/question-graph-bindings/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string }> },
) {
  const path = bindableNodePathSchema.safeParse(await context.params);
  const query = bindableNodeQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!path.success || !query.success)
    return apiError("请检查课程或搜索条件", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await listBindableNodes(
        teacher.id,
        path.data.courseId,
        query.data.keyword,
        query.data.limit,
      ),
    );
  } catch (error) {
    return questionGraphBindingApiError(error);
  }
}
