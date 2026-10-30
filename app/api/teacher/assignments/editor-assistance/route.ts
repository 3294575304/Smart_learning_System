import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  assembleAssignmentReview,
  previewAssignmentPublication,
} from "@/services/assignments/editor-assistance";
import { editorAssistanceSchema } from "@/services/assignments/editor-assistance-schemas";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    const input = editorAssistanceSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success)
      return apiError(input.error.issues[0]?.message ?? "请检查作业参数", 400);
    return apiSuccess(
      input.data.action === "ASSEMBLE"
        ? await assembleAssignmentReview(
            user.id,
            input.data,
            auditRequestContext(request),
          )
        : await previewAssignmentPublication(user.id, input.data),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
