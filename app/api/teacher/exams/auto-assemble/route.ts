import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { autoAssembleExamQuestions } from "@/services/exams/auto-assembly";
import { examAutoAssembleSchema } from "@/services/exams/schemas";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    const parsed = examAutoAssembleSchema.safeParse(await request.json());
    if (!parsed.success) return apiError("请检查知识点与题型数量", 400);
    return apiSuccess(await autoAssembleExamQuestions(user.id, parsed.data));
  } catch (error) {
    return assignmentApiError(error);
  }
}
