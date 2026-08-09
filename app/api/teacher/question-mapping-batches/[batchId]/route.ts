import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionGraphBindingApiError } from "@/lib/question-graph-binding-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { questionMappingPathSchema } from "@/services/question-mapping/schemas";
import { getQuestionMappingBatch } from "@/services/question-mapping/service";

type Context = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, context: Context) {
  const path = questionMappingPathSchema.safeParse(await context.params);
  if (!path.success) return apiError("批次 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getQuestionMappingBatch(teacher.id, path.data.batchId),
    );
  } catch (error) {
    return questionGraphBindingApiError(error);
  }
}
