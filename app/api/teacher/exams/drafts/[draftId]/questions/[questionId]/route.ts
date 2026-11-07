import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  removePaperDraftQuestion,
  updatePaperDraftQuestion,
} from "@/services/exams/paper-drafts";
import {
  paperDraftQuestionEditSchema,
  paperDraftReviewSchema,
} from "@/services/exams/paper-schemas";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ draftId: string; questionId: string }> },
) {
  const params = await context.params;
  const ids = z
    .object({ draftId: z.string().cuid(), questionId: z.string().cuid() })
    .safeParse(params);
  const body = paperDraftQuestionEditSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!ids.success || !body.success) return apiError("题目参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await updatePaperDraftQuestion(
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ draftId: string; questionId: string }> },
) {
  const params = await context.params;
  const ids = z
    .object({ draftId: z.string().cuid(), questionId: z.string().cuid() })
    .safeParse(params);
  const body = paperDraftReviewSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!ids.success || !body.success) return apiError("题目参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await removePaperDraftQuestion(
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
