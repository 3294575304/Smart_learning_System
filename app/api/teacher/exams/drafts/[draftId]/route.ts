import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  getPaperDraft,
  updatePaperDraftConfig,
} from "@/services/exams/paper-drafts";
import { paperDraftConfigSchema } from "@/services/exams/paper-schemas";

type Context = { params: Promise<{ draftId: string }> };
export async function GET(_request: Request, context: Context) {
  const id = z
    .string()
    .cuid()
    .safeParse((await context.params).draftId);
  if (!id.success) return apiError("草稿 ID 无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await getPaperDraft(teacher.id, id.data), 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return assignmentApiError(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  const id = z
    .string()
    .cuid()
    .safeParse((await context.params).draftId);
  const body = paperDraftConfigSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!id.success || !body.success) return apiError("考试设置无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await updatePaperDraftConfig(
        teacher.id,
        id.data,
        body.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
