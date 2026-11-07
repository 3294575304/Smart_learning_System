import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { examCreateSchema } from "@/services/exams/schemas";
import { createExamSession, listTeacherExams } from "@/services/exams/service";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listTeacherExams(user.id));
  } catch (error) {
    return assignmentApiError(error);
  }
}

export async function POST(request: Request) {
  const parsed = examCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return apiError(parsed.error.issues[0]?.message ?? "请检查考试信息", 400);
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await createExamSession(
        user.id,
        parsed.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
