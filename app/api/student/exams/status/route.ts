import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { submissionIdSchema } from "@/services/assignments/schemas";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getStudentExamAttemptStatus } from "@/services/exams/service";

export async function GET(request: Request) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const query = new URL(request.url).searchParams;
    const id = submissionIdSchema.safeParse(query.get("submissionId"));
    if (!id.success || query.getAll("submissionId").length !== 1)
      return apiError("提交 ID 格式无效", 400);
    return apiSuccess(
      await getStudentExamAttemptStatus(student.id, id.data),
      200,
      {
        "Cache-Control": "private, no-store",
      },
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
