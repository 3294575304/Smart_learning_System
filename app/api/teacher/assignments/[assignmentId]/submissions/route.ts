import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  assignmentIdSchema,
  teacherSubmissionListQuerySchema,
} from "@/services/assignments/schemas";
import { listTeacherAssignmentSubmissions } from "@/services/assignments/manual-grading";

interface Context {
  params: Promise<{ assignmentId: string }>;
}

export async function GET(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const assignmentId = assignmentIdSchema.safeParse(
      (await context.params).assignmentId,
    );
    if (!assignmentId.success) {
      return apiError("作业 ID 格式无效", 400);
    }
    const query = teacherSubmissionListQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) return apiError("请检查提交筛选条件", 400);
    return apiSuccess(
      await listTeacherAssignmentSubmissions(
        teacher.id,
        assignmentId.data,
        query.data,
      ),
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
