import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  autosaveAnswersSchema,
  submissionIdSchema,
} from "@/services/assignments/schemas";
import { submitStudentAssignment } from "@/services/assignments/service";
import { z } from "zod";

const autoSubmitSchema = z.union([
  z.object({
    trigger: z.literal("EXIT"),
    submissionId: submissionIdSchema,
    answers: autosaveAnswersSchema.optional(),
  }),
  z.object({ trigger: z.undefined(), submissionId: submissionIdSchema }),
]);

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = autoSubmitSchema.safeParse(body);
  if (!parsed.success) return apiError("自动交卷参数无效", 400);
  try {
    const user = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await submitStudentAssignment(
        user.id,
        parsed.data.submissionId,
        parsed.data.trigger === "EXIT" ? "EXAM_EXIT" : "EXAM_AUTO",
        parsed.data.trigger === "EXIT" ? parsed.data.answers : undefined,
      ),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
