import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { submissionIdSchema } from "@/services/assignments/schemas";
import { submitStudentAssignment } from "@/services/assignments/service";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = submissionIdSchema.safeParse(
    body && typeof body === "object"
      ? (body as { submissionId?: unknown }).submissionId
      : null,
  );
  if (!parsed.success) return apiError("提交 ID 格式无效", 400);
  try {
    const user = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await submitStudentAssignment(user.id, parsed.data, "EXAM_AUTO"),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
