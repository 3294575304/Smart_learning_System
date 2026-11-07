import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { examQuestionQuerySchema } from "@/services/exams/schemas";
import { listEligibleExamQuestions } from "@/services/exams/service";

export async function GET(request: Request) {
  const parsed = examQuestionQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return apiError("请检查选题条件", 400);
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listEligibleExamQuestions(user.id, parsed.data));
  } catch (error) {
    return assignmentApiError(error);
  }
}
