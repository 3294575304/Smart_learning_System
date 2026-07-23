import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { saveManualAnswerGrade } from "@/services/assignments/manual-grading";
import {
  assignmentIdSchema,
  manualGradeAnswerSchema,
  studentAnswerIdSchema,
  submissionIdSchema,
} from "@/services/assignments/schemas";

interface Context {
  params: Promise<{
    assignmentId: string;
    submissionId: string;
    answerId: string;
  }>;
}

export async function PATCH(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const params = await context.params;
    const assignmentId = assignmentIdSchema.safeParse(params.assignmentId);
    const submissionId = submissionIdSchema.safeParse(params.submissionId);
    const answerId = studentAnswerIdSchema.safeParse(params.answerId);
    if (!assignmentId.success || !submissionId.success || !answerId.success) {
      return apiError("作业、提交或答案 ID 格式无效", 400);
    }
    const body: unknown = await request.json().catch(() => null);
    const input = manualGradeAnswerSchema.safeParse(body);
    if (!input.success) {
      return apiError(
        "请检查人工评分",
        400,
        definedFieldErrors(input.error.flatten().fieldErrors),
      );
    }
    return apiSuccess(
      await saveManualAnswerGrade(
        teacher.id,
        assignmentId.data,
        submissionId.data,
        answerId.data,
        input.data,
      ),
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
