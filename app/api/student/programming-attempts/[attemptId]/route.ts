import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { programmingAttemptPathSchema } from "@/services/programming-attempts/schemas";
import { getStudentProgrammingAttempt } from "@/services/programming-attempts/service";

type Context = { params: Promise<{ attemptId: string }> };

export async function GET(_request: Request, context: Context) {
  const path = programmingAttemptPathSchema.safeParse(await context.params);
  if (!path.success) return apiError("Attempt ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await getStudentProgrammingAttempt(student.id, path.data.attemptId),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
