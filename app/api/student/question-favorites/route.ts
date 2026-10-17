import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { favoriteQuerySchema } from "@/services/question-favorites/schemas";
import { listFavorites } from "@/services/question-favorites/service";
export async function GET(request: Request) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const query = favoriteQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) return apiError("收藏筛选条件无效", 400);
    return apiSuccess(await listFavorites(student, query.data), 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return recommendationApiError(error);
  }
}
