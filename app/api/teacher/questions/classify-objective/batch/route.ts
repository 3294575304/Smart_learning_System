import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { retryQuestionObjectiveClassification } from "@/services/question-objectives/retry";

const schema = z.object({
  courseId: z.string().cuid(),
  requestId: z.string().uuid(),
  questionIds: z
    .array(z.string().cuid())
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length),
});

export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return apiError("每次请选择 1–20 道不同的题目", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    let queued = 0;
    let skipped = 0;
    let failed = 0;
    for (const questionId of input.data.questionIds) {
      try {
        const result = await retryQuestionObjectiveClassification(
          teacher.id,
          questionId,
          input.data.courseId,
          input.data.requestId,
          true,
        );
        if (result.status === "QUEUED") queued += 1;
        else skipped += 1;
      } catch (error) {
        if (error instanceof ResourceNotFoundError) skipped += 1;
        else failed += 1;
      }
    }
    return apiSuccess({ queued, skipped, failed });
  } catch (error) {
    return questionApiError(error);
  }
}
