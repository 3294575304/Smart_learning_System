import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { recommendationIdSchema } from "@/services/recommendations/schemas";
import { getRecommendationDetail } from "@/services/recommendations/service";

interface Context {
  params: Promise<{ recommendationId: string }>;
}

export async function GET(_request: Request, context: Context) {
  const parsed = recommendationIdSchema.safeParse(
    (await context.params).recommendationId,
  );
  if (!parsed.success) return apiError("推荐记录 ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await getRecommendationDetail(student, parsed.data));
  } catch (error: unknown) {
    return recommendationApiError(error);
  }
}
