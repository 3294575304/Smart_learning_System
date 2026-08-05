import { Role } from "@prisma/client";
import { after } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { knowledgeGraphApiError } from "@/lib/knowledge-graph-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  generateTeacherKnowledgeGraph,
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
    const queued = await queueTeacherKnowledgeGraph(user.id, parsed.data);
    if (queued.shouldExecute) {
      const context = auditRequestContext(request);
      after(async () => {
        try {
          await generateTeacherKnowledgeGraph(user.id, parsed.data, context);
        } catch {
          // The persistent draft records a safe failure code for polling clients.
        }
      });
    }
    return apiSuccess(queued, queued.reused ? 200 : 202);
  } catch (error) {
    return knowledgeGraphApiError(error);
  }
}
