import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { gradebookApiError } from "@/lib/gradebook-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { executeTeacherGradeImport } from "@/services/gradebook/grade-import-service";
import { gradeImportBatchIdSchema } from "@/services/gradebook/schemas";

interface RouteContext {
  params: Promise<{ batchId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const id = gradeImportBatchIdSchema.safeParse((await context.params).batchId);
  if (!id.success) return apiError("导入批次 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await executeTeacherGradeImport(
        teacher.id,
        id.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}
