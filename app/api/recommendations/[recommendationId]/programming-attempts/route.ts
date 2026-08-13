import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { createRecommendationProgrammingAttemptSchema } from "@/services/programming-attempts/schemas";
import { createRecommendationProgrammingAttempt } from "@/services/programming-attempts/service";
import { recommendationIdSchema } from "@/services/recommendations/schemas";

type Context = { params: Promise<{ recommendationId: string }> };

export async function POST(request: Request, context: Context) {
  const id = recommendationIdSchema.safeParse(
    (await context.params).recommendationId,
  );
  const input = createRecommendationProgrammingAttemptSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!id.success) return apiError("推荐 ID 格式无效", 400);
  if (!input.success) return apiError("请检查 Python 代码", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await createRecommendationProgrammingAttempt(
        student.id,
        id.data,
        input.data,
      ),
      202,
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
