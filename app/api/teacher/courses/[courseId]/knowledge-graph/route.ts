import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { knowledgeGraphApiError } from "@/lib/knowledge-graph-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { scheduleBackgroundWorkerWakeup } from "@/services/background-jobs/wakeup";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  getTeacherKnowledgeGraph,
  queueTeacherKnowledgeGraph,
} from "@/services/knowledge-graph/service";
interface Context {
  params: Promise<{ courseId: string }>;
}
async function id(context: Context) {
  return courseIdSchema.safeParse((await context.params).courseId);
}
export async function GET(_request: Request, context: Context) {
  const parsed = await id(context);
  if (!parsed.success) return apiError("课程 ID 格式无效", 400);
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await getTeacherKnowledgeGraph(user.id, parsed.data));
  } catch (error) {
    return knowledgeGraphApiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  const parsed = await id(context);
  if (!parsed.success) return apiError("课程 ID 格式无效", 400);
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    const queued = await queueTeacherKnowledgeGraph(
      user.id,
      parsed.data,
      auditRequestContext(request),
    );
    if (queued.shouldExecute) scheduleBackgroundWorkerWakeup();
    return apiSuccess(queued, queued.reused ? 200 : 202);
  } catch (error) {
    return knowledgeGraphApiError(error);
  }
}
