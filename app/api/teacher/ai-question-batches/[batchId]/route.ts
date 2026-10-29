import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { aiQuestionErrorResponse } from "@/services/ai-question-generation/errors";
import { questionGenerationBatchPathSchema } from "@/services/ai-question-generation/schemas";
import {
  deleteQuestionGenerationBatch,
  getQuestionGenerationBatch,
} from "@/services/ai-question-generation/service";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

type Context = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const path = questionGenerationBatchPathSchema.safeParse(
      await context.params,
    );
    if (!path.success) return apiError("生成任务不存在", 404);
    return apiSuccess(
      await getQuestionGenerationBatch(teacher.id, path.data.batchId),
    );
  } catch (error) {
    const safe = aiQuestionErrorResponse(error);
    return apiError(safe.message, safe.status, undefined, safe.code);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const path = questionGenerationBatchPathSchema.safeParse(
      await context.params,
    );
    if (!path.success) return apiError("生成任务不存在", 404);
    return apiSuccess(
      await deleteQuestionGenerationBatch(
        teacher.id,
        path.data.batchId,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    const safe = aiQuestionErrorResponse(error);
    return apiError(safe.message, safe.status, undefined, safe.code);
  }
}
