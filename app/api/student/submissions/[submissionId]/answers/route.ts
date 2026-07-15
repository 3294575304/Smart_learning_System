import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  autosaveAnswersSchema,
  submissionIdSchema,
} from "@/services/assignments/schemas";
import { saveStudentAnswers } from "@/services/assignments/service";

interface Context {
  params: Promise<{ submissionId: string }>;
}

export async function PUT(request: Request, context: Context) {
  const id = submissionIdSchema.safeParse((await context.params).submissionId);
  const body: unknown = await request.json().catch(() => null);
  const input = autosaveAnswersSchema.safeParse(body);
  if (!id.success) return apiError("提交 ID 格式无效", 400);
  if (!input.success) {
    return apiError(
      "请检查答案内容",
      400,
      definedFieldErrors(input.error.flatten().fieldErrors),
    );
  }
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await saveStudentAnswers(student.id, id.data, input.data),
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
