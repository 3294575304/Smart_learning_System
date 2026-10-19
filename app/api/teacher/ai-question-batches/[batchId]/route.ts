import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { aiQuestionErrorResponse } from "@/services/ai-question-generation/errors";
import { getQuestionGenerationBatch } from "@/services/ai-question-generation/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

type Context = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const { batchId } = await context.params;
    return apiSuccess(await getQuestionGenerationBatch(teacher.id, batchId));
  } catch (error) {
    const safe = aiQuestionErrorResponse(error);
    return apiError(safe.message, safe.status, undefined, safe.code);
  }
}
