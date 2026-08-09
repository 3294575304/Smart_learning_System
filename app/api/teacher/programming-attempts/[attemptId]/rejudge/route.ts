import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  programmingAttemptPathSchema,
  rejudgeProgrammingAttemptSchema,
} from "@/services/programming-attempts/schemas";
import { rejudgeProgrammingAttempt } from "@/services/programming-attempts/service";

type Context = { params: Promise<{ attemptId: string }> };

export async function POST(request: Request, context: Context) {
  const path = programmingAttemptPathSchema.safeParse(await context.params);
  const body = rejudgeProgrammingAttemptSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success || !body.success) return apiError("请检查重判参数", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await rejudgeProgrammingAttempt(
        teacher.id,
        path.data.attemptId,
        body.data.reason,
        body.data.idempotencyKey,
        auditRequestContext(request),
      ),
      202,
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
