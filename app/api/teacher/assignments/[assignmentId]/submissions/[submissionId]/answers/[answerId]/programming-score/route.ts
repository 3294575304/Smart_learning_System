import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { Role } from "@prisma/client";
import {
  assignmentIdSchema,
  studentAnswerIdSchema,
  submissionIdSchema,
} from "@/services/assignments/schemas";
import { calculateTeacherProgrammingPaperScore } from "@/services/assignments/programming-paper-score";

interface Context {
  params: Promise<{
    assignmentId: string;
    submissionId: string;
    answerId: string;
  }>;
}

export async function POST(_request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const params = await context.params;
    const assignmentId = assignmentIdSchema.safeParse(params.assignmentId);
    const submissionId = submissionIdSchema.safeParse(params.submissionId);
    const answerId = studentAnswerIdSchema.safeParse(params.answerId);
    if (!assignmentId.success || !submissionId.success || !answerId.success) {
      return apiError("作业、提交或答案 ID 格式无效", 400);
    }
    return apiSuccess(
      await calculateTeacherProgrammingPaperScore(
        teacher.id,
        assignmentId.data,
        submissionId.data,
        answerId.data,
      ),
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
