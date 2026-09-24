import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { questionGraphBindingApiError } from "@/lib/question-graph-binding-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  graphConceptQuestionsPathSchema,
  graphConceptQuestionsQuerySchema,
} from "@/services/question-graph-bindings/schemas";
import { listGraphConceptQuestions } from "@/services/question-graph-bindings/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string; conceptId: string }> },
) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const path = graphConceptQuestionsPathSchema.safeParse(
      await context.params,
    );
    const query = graphConceptQuestionsQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!path.success || !query.success)
      return apiError("请检查知识点或题目筛选条件", 400);
    return apiSuccess(
      await listGraphConceptQuestions(
        teacher.id,
        path.data.courseId,
        path.data.conceptId,
        query.data,
      ),
    );
  } catch (error) {
    return questionGraphBindingApiError(error);
  }
}
