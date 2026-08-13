import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  programmingAttemptPathSchema,
  revokeProgrammingAttemptSchema,
} from "@/services/programming-attempts/schemas";
import { revokeRecommendationProgrammingAttempt } from "@/services/programming-attempts/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  const path = programmingAttemptPathSchema.safeParse(await context.params);
  const input = revokeProgrammingAttemptSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success || !input.success) return apiError("请检查撤销请求", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await revokeRecommendationProgrammingAttempt(
        teacher.id,
        path.data.attemptId,
        input.data.reason,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
