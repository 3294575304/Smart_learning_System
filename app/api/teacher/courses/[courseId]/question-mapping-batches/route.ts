import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionGraphBindingApiError } from "@/lib/question-graph-binding-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  courseQuestionMappingPathSchema,
  createQuestionMappingBatchSchema,
} from "@/services/question-mapping/schemas";
import { queueQuestionMappingBatch } from "@/services/question-mapping/service";
import { scheduleBackgroundWorkerWakeup } from "@/services/background-jobs/wakeup";

type Context = { params: Promise<{ courseId: string }> };

export async function POST(request: Request, context: Context) {
  const path = courseQuestionMappingPathSchema.safeParse(await context.params);
  const body = createQuestionMappingBatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success || !body.success)
    return apiError("请检查候选生成参数", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const batch = await queueQuestionMappingBatch(
      teacher.id,
      path.data.courseId,
      body.data,
      auditRequestContext(request),
    );
    scheduleBackgroundWorkerWakeup();
    return apiSuccess(batch, batch.status === "READY" ? 200 : 202);
  } catch (error) {
    return questionGraphBindingApiError(error);
  }
}
