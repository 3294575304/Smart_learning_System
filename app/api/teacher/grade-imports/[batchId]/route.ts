import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { gradebookApiError } from "@/lib/gradebook-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getTeacherGradeImportBatch } from "@/services/gradebook/grade-import-service";
import { gradeImportBatchIdSchema } from "@/services/gradebook/schemas";

interface RouteContext {
  params: Promise<{ batchId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const id = gradeImportBatchIdSchema.safeParse((await context.params).batchId);
  if (!id.success) return apiError("导入批次 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await getTeacherGradeImportBatch(teacher.id, id.data));
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}
