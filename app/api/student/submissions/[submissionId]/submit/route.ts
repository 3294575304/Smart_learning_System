import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { submissionIdSchema } from "@/services/assignments/schemas";
import { submitStudentAssignment } from "@/services/assignments/service";

interface Context {
  params: Promise<{ submissionId: string }>;
}

export async function POST(_request: Request, context: Context) {
  const id = submissionIdSchema.safeParse((await context.params).submissionId);
  if (!id.success) return apiError("提交 ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await submitStudentAssignment(student.id, id.data));
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
