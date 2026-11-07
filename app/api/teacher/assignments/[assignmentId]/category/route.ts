import { revalidatePath } from "next/cache";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { assignmentIdSchema } from "@/services/assignments/schemas";
import {
  categoryCorrectionSchema,
  correctLegacyCategory,
} from "@/services/assignments/category-correction";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const user = await requireAuthenticatedUser(["TEACHER"]);
    const id = assignmentIdSchema.safeParse(
      (await context.params).assignmentId,
    );
    const input = categoryCorrectionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!id.success || !input.success)
      return apiError("请核对作业类别和修正原因", 400);
    const result = await correctLegacyCategory(
      user.id,
      id.data,
      input.data,
      auditRequestContext(request),
    );
    revalidatePath("/teacher/assignments");
    revalidatePath(`/teacher/assignments/${id.data}`);
    return apiSuccess(result);
  } catch (error) {
    return assignmentApiError(error);
  }
}
