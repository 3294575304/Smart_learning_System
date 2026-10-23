import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { aiQuestionErrorResponse } from "@/services/ai-question-generation/errors";
import {
  listQuestionGenerationBatches,
  queueQuestionGeneration,
} from "@/services/ai-question-generation/service";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { scheduleBackgroundWorkerWakeup } from "@/services/background-jobs/wakeup";

export async function GET() {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listQuestionGenerationBatches(teacher.id));
  } catch (error) {
    const safe = aiQuestionErrorResponse(error);
    return apiError(safe.message, safe.status, undefined, safe.code);
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      return apiError("请使用表单提交出题要求", 400);
    const form = await request.formData();
    const raw = form.get("request");
    let input: unknown = null;
    if (typeof raw === "string") {
      try {
        input = JSON.parse(raw);
      } catch {
        return apiError("出题要求格式无效", 400);
      }
    }
    const file = form.get("file");
    const result = await queueQuestionGeneration(
      teacher.id,
      input,
      file instanceof File ? file : null,
      auditRequestContext(request),
    );
    scheduleBackgroundWorkerWakeup();
    return apiSuccess(result, 202);
  } catch (error) {
    const safe = aiQuestionErrorResponse(error);
    return apiError(safe.message, safe.status, undefined, safe.code);
  }
}
