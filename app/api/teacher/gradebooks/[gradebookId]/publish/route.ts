import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { gradebookApiError } from "@/lib/gradebook-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { gradebookIdSchema } from "@/services/gradebook/schemas";
import { publishTeacherGradebook } from "@/services/gradebook/service";

interface RouteContext {
  params: Promise<{ gradebookId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const id = gradebookIdSchema.safeParse((await context.params).gradebookId);
  if (!id.success) return apiError("成绩台账 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await publishTeacherGradebook(
        teacher.id,
        id.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}
