import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { gradebookApiError } from "@/lib/gradebook-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  gradebookIdSchema,
  syncPlatformGradesSchema,
} from "@/services/gradebook/schemas";
import { syncTeacherPlatformAssignmentGrades } from "@/services/gradebook/service";

interface RouteContext {
  params: Promise<{ gradebookId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const id = gradebookIdSchema.safeParse((await context.params).gradebookId);
  if (!id.success) return apiError("成绩台账 ID 格式无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = syncPlatformGradesSchema.safeParse(body);
  if (!input.success) {
    return apiError("同步参数无效", 400, input.error.flatten().fieldErrors);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await syncTeacherPlatformAssignmentGrades(
        teacher.id,
        id.data,
        input.data.componentId,
        input.data.assignmentId,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}
