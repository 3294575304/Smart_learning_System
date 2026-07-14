import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  questionIdSchema,
  questionUpsertSchema,
} from "@/services/questions/schemas";
import {
  deleteQuestion,
  getTeacherQuestion,
  updateQuestion,
} from "@/services/questions/service";

interface QuestionRouteContext {
  params: Promise<{ questionId: string }>;
}

async function parseQuestionId(context: QuestionRouteContext) {
  const { questionId } = await context.params;
  return questionIdSchema.safeParse(questionId);
}

export async function GET(_request: Request, context: QuestionRouteContext) {
  const parsedId = await parseQuestionId(context);
  if (!parsedId.success) {
    return apiError("题目 ID 格式无效", 400);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await getTeacherQuestion(teacher.id, parsedId.data));
  } catch (error: unknown) {
    return questionApiError(error);
  }
}

export async function PATCH(request: Request, context: QuestionRouteContext) {
  const parsedId = await parseQuestionId(context);
  const body: unknown = await request.json().catch(() => null);
  const parsedInput = questionUpsertSchema.safeParse(body);
  if (!parsedId.success) {
    return apiError("题目 ID 格式无效", 400);
  }
  if (!parsedInput.success) {
    return apiError(
      "请检查题目信息",
      400,
      definedFieldErrors(parsedInput.error.flatten().fieldErrors),
    );
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await updateQuestion(teacher.id, parsedId.data, parsedInput.data),
    );
  } catch (error: unknown) {
    return questionApiError(error);
  }
}

export async function DELETE(_request: Request, context: QuestionRouteContext) {
  const parsedId = await parseQuestionId(context);
  if (!parsedId.success) {
    return apiError("题目 ID 格式无效", 400);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await deleteQuestion(teacher.id, parsedId.data));
  } catch (error: unknown) {
    return questionApiError(error);
  }
}
