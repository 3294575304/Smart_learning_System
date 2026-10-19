import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { aiQuestionErrorResponse } from "@/services/ai-question-generation/errors";
import { retryQuestionGeneration } from "@/services/ai-question-generation/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { scheduleBackgroundWorkerWakeup } from "@/services/background-jobs/wakeup";

type Context = { params: Promise<{ batchId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const { batchId } = await context.params;
    const result = await retryQuestionGeneration(teacher.id, batchId);
    scheduleBackgroundWorkerWakeup();
    return apiSuccess(result, 202);
  } catch (error) {
    const safe = aiQuestionErrorResponse(error);
    return apiError(safe.message, safe.status, undefined, safe.code);
  }
}
