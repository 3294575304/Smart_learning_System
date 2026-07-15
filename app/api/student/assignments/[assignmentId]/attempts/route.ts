import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  assignmentIdSchema,
  startAttemptSchema,
} from "@/services/assignments/schemas";
import { startOrResumeAttempt } from "@/services/assignments/service";

interface Context {
  params: Promise<{ assignmentId: string }>;
}

export async function POST(request: Request, context: Context) {
  const id = assignmentIdSchema.safeParse((await context.params).assignmentId);
  const body: unknown = await request.json().catch(() => null);
  const input = startAttemptSchema.safeParse(body);
  if (!id.success) return apiError("作业 ID 格式无效", 400);
  if (!input.success) return apiError("幂等键格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await startOrResumeAttempt(
        student.id,
        id.data,
        input.data.idempotencyKey,
      ),
      201,
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
