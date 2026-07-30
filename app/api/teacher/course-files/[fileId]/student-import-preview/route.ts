import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import { studentImportApiError } from "@/lib/student-import-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseFileIdSchema } from "@/services/course-files/schemas";
import { previewTeacherStudentImportFromFile } from "@/services/student-imports/service";
import { studentImportPreviewRequestSchema } from "@/services/student-imports/schemas";

interface RouteContext {
  params: Promise<{ fileId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  const parsedId = courseFileIdSchema.safeParse(fileId);
  if (!parsedId.success) {
    return apiError("文件 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const body: unknown = await request.json().catch(() => null);
    const parsedBody = studentImportPreviewRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return apiError(
        "请检查学生名单预览参数",
        400,
        definedFieldErrors(parsedBody.error.flatten().fieldErrors),
      );
    }

    return apiSuccess(
      await previewTeacherStudentImportFromFile(
        teacher.id,
        parsedId.data,
        parsedBody.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return studentImportApiError(error);
  }
}
