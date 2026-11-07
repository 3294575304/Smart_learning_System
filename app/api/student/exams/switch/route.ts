import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { submissionIdSchema } from "@/services/assignments/schemas";
import { examSwitchSchema } from "@/services/exams/schemas";
import { recordExamSwitch } from "@/services/exams/service";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = examSwitchSchema
    .extend({ submissionId: submissionIdSchema })
    .safeParse(body);
  if (!parsed.success) return apiError("请检查切屏事件", 400);
  try {
    const user = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await recordExamSwitch(
        user.id,
        parsed.data.submissionId,
        parsed.data.eventKey,
      ),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
