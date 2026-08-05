import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { knowledgeGraphApiError } from "@/lib/knowledge-graph-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { courseIdSchema } from "@/services/courses/schemas";
import { saveTeacherKnowledgeGraphReview } from "@/services/knowledge-graph/service";
import { saveKnowledgeGraphReviewSchema } from "@/services/knowledge-graph/schemas";
interface Context {
  params: Promise<{ courseId: string; draftId: string }>;
}
export async function PATCH(request: Request, context: Context) {
  const p = await context.params;
  const courseId = courseIdSchema.safeParse(p.courseId);
  const draftId = z.string().cuid().safeParse(p.draftId);
  if (!courseId.success || !draftId.success)
    return apiError("课程或图谱草稿 ID 格式无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = saveKnowledgeGraphReviewSchema.safeParse(body);
  if (!input.success)
    return apiError("审核稿参数无效", 400, input.error.flatten().fieldErrors);
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await saveTeacherKnowledgeGraphReview(
        user.id,
        courseId.data,
        draftId.data,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return knowledgeGraphApiError(error);
  }
}
