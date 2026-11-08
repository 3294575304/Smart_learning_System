import { Role } from "@prisma/client";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { retryQuestionObjectiveClassification } from "@/services/question-objectives/retry";
import { questionIdSchema } from "@/services/questions/schemas";

const requestSchema = z.object({
  courseId: z.string().cuid().nullable(),
  requestId: z.string().uuid(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await context.params;
  const parsedId = questionIdSchema.safeParse(questionId);
  const parsedInput = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsedId.success || !parsedInput.success)
    return apiError("课程或题目参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await retryQuestionObjectiveClassification(
        teacher.id,
        parsedId.data,
        parsedInput.data.courseId,
        parsedInput.data.requestId,
      ),
    );
  } catch (error: unknown) {
    return questionApiError(error);
  }
}
