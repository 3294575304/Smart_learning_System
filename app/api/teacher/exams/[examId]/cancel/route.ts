import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { cancelExamSession } from "@/services/exams/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ examId: string }> },
) {
  const parsed = z
    .string()
    .cuid()
    .safeParse((await context.params).examId);
  if (!parsed.success) return apiError("考试 ID 无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await cancelExamSession(
        teacher.id,
        parsed.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
