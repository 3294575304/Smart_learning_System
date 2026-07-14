import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { questionIdSchema } from "@/services/questions/schemas";
import { copyQuestion } from "@/services/questions/service";

interface CopyQuestionRouteContext {
  params: Promise<{ questionId: string }>;
}

export async function POST(
  _request: Request,
  context: CopyQuestionRouteContext,
) {
  const { questionId } = await context.params;
  const parsedId = questionIdSchema.safeParse(questionId);
  if (!parsedId.success) {
    return apiError("题目 ID 格式无效", 400);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await copyQuestion(teacher.id, parsedId.data), 201);
  } catch (error: unknown) {
    return questionApiError(error);
  }
}
