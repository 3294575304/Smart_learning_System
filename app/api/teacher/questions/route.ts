import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  questionListQuerySchema,
  questionUpsertSchema,
} from "@/services/questions/schemas";
import {
  createQuestion,
  listTeacherQuestions,
} from "@/services/questions/service";

export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = questionListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return apiError("请检查筛选条件", 400);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listTeacherQuestions(teacher.id, parsed.data));
  } catch (error: unknown) {
    return questionApiError(error);
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = questionUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "请检查题目信息",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await createQuestion(teacher.id, parsed.data), 201);
  } catch (error: unknown) {
    return questionApiError(error);
  }
}
