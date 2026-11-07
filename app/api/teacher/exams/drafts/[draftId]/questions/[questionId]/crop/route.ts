import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { cropPaperDraftImage } from "@/services/exams/paper-drafts";
import { paperDraftCropSchema } from "@/services/exams/paper-schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string; questionId: string }> },
) {
  const ids = z
    .object({ draftId: z.string().cuid(), questionId: z.string().cuid() })
    .safeParse(await context.params);
  const body = paperDraftCropSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!ids.success || !body.success) return apiError("裁切参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await cropPaperDraftImage(
        teacher.id,
        ids.data.draftId,
        ids.data.questionId,
        body.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
