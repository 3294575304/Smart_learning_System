import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  programmingAttemptPathSchema,
  rejudgeProgrammingAttemptSchema,
} from "@/services/programming-attempts/schemas";
import { rejudgeRecommendationProgrammingAttempt } from "@/services/programming-attempts/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  const path = programmingAttemptPathSchema.safeParse(await context.params);
  const input = rejudgeProgrammingAttemptSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success || !input.success) return apiError("请检查重判请求", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await rejudgeRecommendationProgrammingAttempt(
        teacher.id,
        path.data.attemptId,
        input.data.reason,
        input.data.idempotencyKey,
        auditRequestContext(request),
      ),
      202,
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
