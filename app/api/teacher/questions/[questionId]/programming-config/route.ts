import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  programmingConfigRevisionInputSchema,
  programmingQuestionPathSchema,
} from "@/services/programming-questions/schemas";
import {
  createProgrammingConfigRevision,
  getLatestProgrammingConfig,
} from "@/services/programming-questions/service";

type Context = { params: Promise<{ questionId: string }> };

export async function GET(_request: Request, context: Context) {
  const path = programmingQuestionPathSchema.safeParse(await context.params);
  if (!path.success) return apiError("题目 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getLatestProgrammingConfig(teacher.id, path.data.questionId),
    );
  } catch (error) {
    return questionApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  const path = programmingQuestionPathSchema.safeParse(await context.params);
  const body = programmingConfigRevisionInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success || !body.success) {
    return apiError("请检查 Python 判题配置", 400);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await createProgrammingConfigRevision(
        teacher.id,
        path.data.questionId,
        body.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return questionApiError(error);
  }
}
