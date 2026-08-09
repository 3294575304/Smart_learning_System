import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionGraphBindingApiError } from "@/lib/question-graph-binding-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  confirmQuestionMappingBatchSchema,
  questionMappingPathSchema,
} from "@/services/question-mapping/schemas";
import { confirmQuestionMappingBatch } from "@/services/question-mapping/service";

type Context = { params: Promise<{ batchId: string }> };

export async function POST(request: Request, context: Context) {
  const path = questionMappingPathSchema.safeParse(await context.params);
  const body = confirmQuestionMappingBatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success || !body.success) return apiError("请检查确认参数", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await confirmQuestionMappingBatch(
        teacher.id,
        path.data.batchId,
        body.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return questionGraphBindingApiError(error);
  }
}
