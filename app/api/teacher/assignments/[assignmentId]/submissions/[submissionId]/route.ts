import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  assignmentIdSchema,
  submissionIdSchema,
} from "@/services/assignments/schemas";
import { getTeacherSubmissionForGrading } from "@/services/assignments/manual-grading";

interface Context {
  params: Promise<{ assignmentId: string; submissionId: string }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const params = await context.params;
    const assignmentId = assignmentIdSchema.safeParse(params.assignmentId);
    const submissionId = submissionIdSchema.safeParse(params.submissionId);
    if (!assignmentId.success || !submissionId.success) {
      return apiError("作业或提交 ID 格式无效", 400);
    }
    return apiSuccess(
      await getTeacherSubmissionForGrading(
        teacher.id,
        assignmentId.data,
        submissionId.data,
      ),
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
