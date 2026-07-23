import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { wrongQuestionApiError } from "@/lib/wrong-question-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  wrongQuestionIdSchema,
  wrongQuestionPracticeSchema,
} from "@/services/wrong-questions/schemas";
import { practiceWrongQuestion } from "@/services/wrong-questions/service";

interface Context {
  params: Promise<{ wrongQuestionId: string }>;
}

export async function POST(request: Request, context: Context) {
  const id = wrongQuestionIdSchema.safeParse(
    (await context.params).wrongQuestionId,
  );
  if (!id.success) return apiError("错题记录 ID 格式无效", 400);

  const body: unknown = await request.json().catch(() => null);
  const input = wrongQuestionPracticeSchema.safeParse(body);
  if (!input.success) {
    return apiError(
      "请检查练习答案",
      400,
      definedFieldErrors(input.error.flatten().fieldErrors),
    );
  }

  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await practiceWrongQuestion(student.id, id.data, input.data),
    );
  } catch (error: unknown) {
    return wrongQuestionApiError(error);
  }
}
