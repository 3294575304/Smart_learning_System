import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { knowledgeGraphApiError } from "@/lib/knowledge-graph-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherKnowledgeGraphDiff } from "@/services/knowledge-graph/service";
interface Context {
  params: Promise<{ courseId: string }>;
}
export async function GET(request: Request, context: Context) {
  const courseId = courseIdSchema.safeParse((await context.params).courseId);
  const url = new URL(request.url);
  const ids = z
    .object({ from: z.string().cuid(), to: z.string().cuid() })
    .safeParse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
  if (!courseId.success || !ids.success || ids.data.from === ids.data.to)
    return apiError("版本参数无效", 400);
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getTeacherKnowledgeGraphDiff(
        user.id,
        courseId.data,
        ids.data.from,
        ids.data.to,
      ),
    );
  } catch (error) {
    return knowledgeGraphApiError(error);
  }
}
