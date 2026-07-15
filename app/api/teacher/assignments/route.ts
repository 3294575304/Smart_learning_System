import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  assignmentListQuerySchema,
  assignmentUpsertSchema,
} from "@/services/assignments/schemas";
import {
  createDraftAssignment,
  listTeacherAssignments,
} from "@/services/assignments/service";

export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = assignmentListQuerySchema.safeParse(query);
  if (!parsed.success) return apiError("请检查筛选条件", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listTeacherAssignments(teacher.id, parsed.data));
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = assignmentUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "请检查作业信息",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await createDraftAssignment(teacher.id, parsed.data),
      201,
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
