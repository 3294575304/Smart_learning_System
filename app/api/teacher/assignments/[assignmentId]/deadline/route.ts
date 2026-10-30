import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { assignmentIdSchema } from "@/services/assignments/schemas";
import { extendAssignmentSchema } from "@/services/assignments/makeup-schemas";
import { extendAssignmentDeadline } from "@/services/assignments/makeup-service";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ assignmentId: string; grantId?: string }> },
) {
  const params = await context.params;
  const id = assignmentIdSchema.safeParse(params.assignmentId);
  const body = extendAssignmentSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!id.success || !body.success)
    return apiError("请检查期限、原因或学生参数", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await extendAssignmentDeadline(
        teacher.id,
        id.data,
        body.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
