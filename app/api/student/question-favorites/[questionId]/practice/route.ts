import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  favoriteQuestionIdSchema,
  favoritePracticeSchema,
} from "@/services/question-favorites/schemas";
import { practiceFavorite } from "@/services/question-favorites/service";
export async function POST(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const id = favoriteQuestionIdSchema.safeParse(
      (await context.params).questionId,
    );
    const input = favoritePracticeSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!id.success || !input.success) return apiError("练习参数无效", 400);
    return apiSuccess(
      await practiceFavorite(student, id.data, input.data),
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
