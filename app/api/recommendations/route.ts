import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  recommendationGenerationApiSchema,
  recommendationListQuerySchema,
} from "@/services/recommendations/schemas";
import {
  createOrGetPersonalizedRecommendations,
  listRecommendations,
} from "@/services/recommendations/service";

export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = recommendationListQuerySchema.safeParse(query);
  if (!parsed.success) return apiError("请检查推荐筛选条件", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await listRecommendations(student, parsed.data));
  } catch (error: unknown) {
    return recommendationApiError(error);
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = recommendationGenerationApiSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "请检查推荐生成参数",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }
  try {
    const actor = await requireAuthenticatedUser([Role.STUDENT, Role.TEACHER]);
    return apiSuccess(
      await createOrGetPersonalizedRecommendations(actor, parsed.data),
    );
  } catch (error: unknown) {
    return recommendationApiError(error);
  }
}
