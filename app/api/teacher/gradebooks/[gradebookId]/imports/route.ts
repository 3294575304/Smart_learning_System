import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { gradebookApiError } from "@/lib/gradebook-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { previewTeacherGradeImport } from "@/services/gradebook/grade-import-service";
import { gradebookIdSchema } from "@/services/gradebook/schemas";

interface RouteContext {
  params: Promise<{ gradebookId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const gradebookId = gradebookIdSchema.safeParse(
    (await context.params).gradebookId,
  );
  if (!gradebookId.success) return apiError("成绩台账 ID 格式无效", 400);
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError("上传内容必须是 multipart/form-data", 400);
  }
  const candidate = formData.get("file");
  const file = candidate instanceof File ? candidate : null;
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await previewTeacherGradeImport(
        teacher.id,
        gradebookId.data,
        file,
        idempotencyKey,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}
