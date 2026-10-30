import { revalidatePath } from "next/cache";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  assignmentDraftActionSchema,
  manageAssignmentDraft,
} from "@/services/assignments/draft-management";
import { z } from "zod";
import {
  copyRevokedAssignmentSchema,
  revokeAssignment,
  revokeAssignmentSchema,
} from "@/services/assignments/revocation";
import {
  copyHistoricalAssignment,
  copyRevokedAssignment,
} from "@/services/assignments/service";
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
  updateDraftAssignmentBatch,
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
    const applyToBatch = new URL(request.url).searchParams.get("batch") === "1";
    if (applyToBatch) {
      const result = await updateDraftAssignmentBatch(
        teacher.id,
        id.data,
        input.data,
      );
      revalidatePath("/teacher/assignments");
      return apiSuccess(result);
    }
    return apiSuccess(
      await updateDraftAssignment(teacher.id, id.data, input.data),
    );
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const id = await parseId(context);
    const input = z
      .union([
        assignmentDraftActionSchema,
        revokeAssignmentSchema,
        copyRevokedAssignmentSchema,
        z
          .object({
            action: z.literal("COPY_HISTORY"),
            requestId: z.string().uuid(),
            classroomId: z.string().cuid(),
          })
          .strict(),
      ])
      .safeParse(await request.json().catch(() => null));
    if (!id.success || !input.success) return apiError("作业操作参数无效", 400);
    const audit = auditRequestContext(request);
    const result =
      input.data.action === "REVOKE"
        ? await revokeAssignment(teacher.id, id.data, input.data, audit)
        : input.data.action === "COPY_REVOKED"
          ? await copyRevokedAssignment(
              teacher.id,
              id.data,
              input.data.requestId,
            )
          : input.data.action === "COPY_HISTORY"
            ? await copyHistoricalAssignment(
                teacher.id,
                id.data,
                input.data.requestId,
                input.data.classroomId,
              )
            : await manageAssignmentDraft(
                teacher.id,
                id.data,
                input.data,
                audit,
              );
    revalidatePath("/teacher/assignments");
    revalidatePath(`/teacher/assignments/${id.data}`);
    return apiSuccess(result);
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
