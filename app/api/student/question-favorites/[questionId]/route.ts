import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  favoriteSaveSchema,
  favoriteNoteSchema,
  favoriteQuestionIdSchema,
} from "@/services/question-favorites/schemas";
import {
  getFavoriteState,
  saveFavorite,
  removeFavorite,
  updateFavoriteNote,
} from "@/services/question-favorites/service";
type Context = { params: Promise<{ questionId: string }> };
async function handle(
  request: Request,
  context: Context,
  method: "GET" | "PUT" | "PATCH" | "DELETE",
) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const id = favoriteQuestionIdSchema.safeParse(
      (await context.params).questionId,
    );
    if (!id.success) return apiError("题目参数无效", 400);
    let data;
    if (method === "PUT" || method === "PATCH") {
      const body = await request.json().catch(() => null);
      if (method === "PUT") {
        const input = favoriteSaveSchema.safeParse(body);
        if (!input.success) return apiError("收藏来源无效", 400);
        data = await saveFavorite(student, id.data, input.data);
      } else {
        const input = favoriteNoteSchema.safeParse(body);
        if (!input.success)
          return apiError("备注最多 1000 字，请检查版本", 400);
        data = await updateFavoriteNote(student, id.data, input.data);
      }
    } else
      data =
        method === "GET"
          ? await getFavoriteState(student, id.data)
          : await removeFavorite(student, id.data);
    return apiSuccess(data, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return recommendationApiError(error);
  }
}
export async function GET(request: Request, context: Context) {
  return handle(request, context, "GET");
}
export async function PUT(request: Request, context: Context) {
  return handle(request, context, "PUT");
}
export async function PATCH(request: Request, context: Context) {
  return handle(request, context, "PATCH");
}
export async function DELETE(request: Request, context: Context) {
  return handle(request, context, "DELETE");
}
