import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { wrongQuestionApiError } from "@/lib/wrong-question-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  wrongQuestionIdSchema,
  wrongQuestionMasterySchema,
} from "@/services/wrong-questions/schemas";
import {
  getWrongQuestionDetail,
  setWrongQuestionMastery,
} from "@/services/wrong-questions/service";

interface Context {
  params: Promise<{ wrongQuestionId: string }>;
}

export async function GET(_request: Request, context: Context) {
  const id = wrongQuestionIdSchema.safeParse(
    (await context.params).wrongQuestionId,
  );
  if (!id.success) return apiError("错题记录 ID 格式无效", 400);

  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await getWrongQuestionDetail(student.id, id.data));
  } catch (error: unknown) {
    return wrongQuestionApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  const id = wrongQuestionIdSchema.safeParse(
    (await context.params).wrongQuestionId,
  );
  if (!id.success) return apiError("错题记录 ID 格式无效", 400);

  const body: unknown = await request.json().catch(() => null);
  const input = wrongQuestionMasterySchema.safeParse(body);
  if (!input.success) {
    return apiError(
      "请检查掌握状态",
      400,
      definedFieldErrors(input.error.flatten().fieldErrors),
    );
  }

  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await setWrongQuestionMastery(student.id, id.data, input.data),
    );
  } catch (error: unknown) {
    return wrongQuestionApiError(error);
  }
}
