import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { scheduleBackgroundWorkerWakeup } from "@/services/background-jobs/wakeup";
import { retryPaperDraft } from "@/services/exams/paper-drafts";

export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  const id = z
    .string()
    .cuid()
    .safeParse((await context.params).draftId);
  if (!id.success) return apiError("草稿 ID 无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const result = await retryPaperDraft(
      teacher.id,
      id.data,
      auditRequestContext(request),
    );
    scheduleBackgroundWorkerWakeup();
    return apiSuccess(result, 202);
  } catch (error) {
    return assignmentApiError(error);
  }
}
