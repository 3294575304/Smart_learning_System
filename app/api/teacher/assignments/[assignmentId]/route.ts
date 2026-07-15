import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  assignmentIdSchema,
  assignmentUpsertSchema,
} from "@/services/assignments/schemas";
import {
  getTeacherAssignment,
  updateDraftAssignment,
} from "@/services/assignments/service";

interface Context {
  params: Promise<{ assignmentId: string }>;
}

async function parseId(context: Context) {
  return assignmentIdSchema.safeParse((await context.params).assignmentId);
}

export async function GET(_request: Request, context: Context) {
  const id = await parseId(context);
  if (!id.success) return apiError("作业 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await getTeacherAssignment(teacher.id, id.data));
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  const id = await parseId(context);
  const body: unknown = await request.json().catch(() => null);
  const input = assignmentUpsertSchema.safeParse(body);
  if (!id.success) return apiError("作业 ID 格式无效", 400);
  if (!input.success) {
    return apiError(
      "请检查作业信息",
      400,
      definedFieldErrors(input.error.flatten().fieldErrors),
    );
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await updateDraftAssignment(teacher.id, id.data, input.data),
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
