import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { outcomeAttainmentApiError } from "@/lib/outcome-attainment-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { gradebookIdSchema } from "@/services/gradebook/schemas";
import {
  generateTeacherOutcomeAttainment,
  getTeacherOutcomeAttainment,
} from "@/services/outcome-attainment/service";
type Context = { params: Promise<{ gradebookId: string }> };
export async function GET(_request: Request, context: Context) {
  const id = gradebookIdSchema.safeParse((await context.params).gradebookId);
  if (!id.success) return apiError("成绩台账 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await getTeacherOutcomeAttainment(teacher.id, id.data));
  } catch (error) {
    return outcomeAttainmentApiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  const id = gradebookIdSchema.safeParse((await context.params).gradebookId);
  if (!id.success) return apiError("成绩台账 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await generateTeacherOutcomeAttainment(
        teacher.id,
        id.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return outcomeAttainmentApiError(error);
  }
}
