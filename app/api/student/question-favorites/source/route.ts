import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { favoriteSourceSchema } from "@/services/question-favorites/schemas";
import { getFavoriteSourceState } from "@/services/question-favorites/service";
export async function GET(request: Request) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const source = favoriteSourceSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!source.success) return apiError("题目来源无效", 400);
    return apiSuccess(await getFavoriteSourceState(student, source.data), 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return recommendationApiError(error);
  }
}
