import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { publishAssignmentResults } from "@/services/assignments/manual-grading";
import { assignmentIdSchema } from "@/services/assignments/schemas";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";

interface Context {
  params: Promise<{ assignmentId: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const assignmentId = assignmentIdSchema.safeParse(
      (await context.params).assignmentId,
    );
    if (!assignmentId.success) return apiError("作业 ID 格式无效", 400);
    return apiSuccess(
      await publishAssignmentResults(
        teacher.id,
        assignmentId.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
