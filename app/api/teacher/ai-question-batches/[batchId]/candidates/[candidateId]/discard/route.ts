import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { aiQuestionErrorResponse } from "@/services/ai-question-generation/errors";
import { discardQuestionCandidate } from "@/services/ai-question-generation/service";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

type Context = { params: Promise<{ batchId: string; candidateId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const { batchId, candidateId } = await context.params;
    return apiSuccess(
      await discardQuestionCandidate(
        teacher.id,
        batchId,
        candidateId,
        await request.json().catch(() => null),
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    const safe = aiQuestionErrorResponse(error);
    return apiError(safe.message, safe.status, undefined, safe.code);
  }
}
