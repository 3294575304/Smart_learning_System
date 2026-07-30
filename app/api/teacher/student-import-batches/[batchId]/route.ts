import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import { studentImportApiError } from "@/lib/student-import-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { studentImportBatchIdSchema } from "@/services/student-imports/schemas";
import { getTeacherStudentImportPreview } from "@/services/student-imports/service";
import { studentImportPreviewPaginationSchema } from "@/services/student-imports/schemas";

interface RouteContext {
  params: Promise<{ batchId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { batchId } = await context.params;
  const parsedId = studentImportBatchIdSchema.safeParse(batchId);
  if (!parsedId.success) {
    return apiError("导入批次 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const query = studentImportPreviewPaginationSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) {
      return apiError(
        "请检查学生名单分页参数",
        400,
        definedFieldErrors(query.error.flatten().fieldErrors),
      );
    }

    return apiSuccess(
      await getTeacherStudentImportPreview(
        teacher.id,
        parsedId.data,
        query.data.page,
        query.data.pageSize,
      ),
    );
  } catch (error: unknown) {
    return studentImportApiError(error);
  }
}
