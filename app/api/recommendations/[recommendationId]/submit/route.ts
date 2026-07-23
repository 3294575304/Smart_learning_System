import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { submitRecommendationPractice } from "@/services/recommendations/practice";
import {
  recommendationIdSchema,
  recommendationPracticeSubmitSchema,
} from "@/services/recommendations/schemas";

interface Context {
  params: Promise<{ recommendationId: string }>;
}

export async function POST(request: Request, context: Context) {
  const recommendationId = recommendationIdSchema.safeParse(
    (await context.params).recommendationId,
  );
  if (!recommendationId.success) {
    return apiError("推荐记录 ID 格式无效", 400);
  }
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const body: unknown = await request.json().catch(() => null);
    const input = recommendationPracticeSubmitSchema.safeParse(body);
    if (!input.success) {
      return apiError(
        "请检查推荐练习答案",
        400,
        definedFieldErrors(input.error.flatten().fieldErrors),
      );
    }
    return apiSuccess(
      await submitRecommendationPractice(
        student,
        recommendationId.data,
        input.data,
      ),
    );
  } catch (error: unknown) {
    return recommendationApiError(error);
  }
}
