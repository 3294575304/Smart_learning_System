import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { assignmentIdSchema } from "@/services/assignments/schemas";
import { getStudentAssignment } from "@/services/assignments/service";

interface Context {
  params: Promise<{ assignmentId: string }>;
}

export async function GET(_request: Request, context: Context) {
  const id = assignmentIdSchema.safeParse((await context.params).assignmentId);
  if (!id.success) return apiError("作业 ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await getStudentAssignment(student.id, id.data));
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
