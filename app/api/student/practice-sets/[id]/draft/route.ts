import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { practiceDraftSaveSchema } from "@/services/practice-sets/draft-schemas";
import { recommendationIdSchema } from "@/services/recommendations/schemas";
import {
  getPracticeAccountDraft,
  PracticeDraftConflict,
  savePracticeAccountDraft,
} from "@/services/practice-sets/draft-service";

type Context = { params: Promise<{ id: string }> };
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireAuthenticatedUser([Role.STUDENT]);
    const id = recommendationIdSchema.safeParse((await context.params).id);
    if (!id.success) return apiError("练习组标识无效", 400);
    return apiSuccess(
      await getPracticeAccountDraft(actor, id.data),
      200,
      privateHeaders,
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const actor = await requireAuthenticatedUser([Role.STUDENT]);
    const id = recommendationIdSchema.safeParse((await context.params).id);
    if (!id.success) return apiError("练习组标识无效", 400);
    const parsed = practiceDraftSaveSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return apiError("草稿内容无效，请检查答案长度后重试。", 400);
    return apiSuccess(
      await savePracticeAccountDraft(actor, id.data, parsed.data),
      200,
      privateHeaders,
    );
  } catch (error) {
    if (error instanceof PracticeDraftConflict)
      return apiError(error.message, 409, undefined, "PRACTICE_DRAFT_CONFLICT");
    return recommendationApiError(error);
  }
}
