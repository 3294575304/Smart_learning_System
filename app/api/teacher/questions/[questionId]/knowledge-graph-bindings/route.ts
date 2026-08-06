import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { questionGraphBindingApiError } from "@/lib/question-graph-binding-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  clearGraphBindingsSchema,
  graphBindingCourseQuerySchema,
  graphBindingPathSchema,
  saveGraphBindingsSchema,
} from "@/services/question-graph-bindings/schemas";
import {
  clearQuestionGraphBindings,
  getQuestionGraphBindings,
  saveQuestionGraphBindings,
} from "@/services/question-graph-bindings/service";

type Context = { params: Promise<{ questionId: string }> };
export async function GET(request: Request, context: Context) {
  const path = graphBindingPathSchema.safeParse(await context.params);
  const query = graphBindingCourseQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!path.success || !query.success)
    return apiError("请检查题目或课程 ID", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getQuestionGraphBindings(
        teacher.id,
        path.data.questionId,
        query.data.courseId,
      ),
    );
  } catch (error) {
    return questionGraphBindingApiError(error);
  }
}
export async function PUT(request: Request, context: Context) {
  const path = graphBindingPathSchema.safeParse(await context.params);
  const body = saveGraphBindingsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success || !body.success) return apiError("请检查绑定信息", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await saveQuestionGraphBindings(
        teacher.id,
        path.data.questionId,
        body.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return questionGraphBindingApiError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  const path = graphBindingPathSchema.safeParse(await context.params);
  const raw: unknown = await request.json().catch(() => null);
  const parsed = clearGraphBindingsSchema.safeParse(raw);
  if (!path.success || !parsed.success)
    return apiError("请检查清除绑定参数", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await clearQuestionGraphBindings(
        teacher.id,
        path.data.questionId,
        parsed.data.courseId,
        parsed.data.expectedRevision,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return questionGraphBindingApiError(error);
  }
}
