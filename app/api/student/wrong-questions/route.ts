import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { wrongQuestionApiError } from "@/lib/wrong-question-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { wrongQuestionListQuerySchema } from "@/services/wrong-questions/schemas";
import { listWrongQuestions } from "@/services/wrong-questions/service";

export async function GET(request: Request) {
  const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
  const query = wrongQuestionListQuerySchema.safeParse(rawQuery);
  if (!query.success) return apiError("请检查错题筛选条件", 400);

  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await listWrongQuestions(student.id, query.data));
  } catch (error: unknown) {
    return wrongQuestionApiError(error);
  }
}
