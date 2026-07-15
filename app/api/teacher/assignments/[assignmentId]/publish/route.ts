import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { assignmentIdSchema } from "@/services/assignments/schemas";
import { publishAssignment } from "@/services/assignments/service";

interface Context {
  params: Promise<{ assignmentId: string }>;
}

export async function POST(_request: Request, context: Context) {
  const id = assignmentIdSchema.safeParse((await context.params).assignmentId);
  if (!id.success) return apiError("作业 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await publishAssignment(teacher.id, id.data));
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
