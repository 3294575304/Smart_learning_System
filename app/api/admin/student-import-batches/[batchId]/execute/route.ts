import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { studentImportApiError } from "@/lib/student-import-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { studentImportBatchIdSchema } from "@/services/student-imports/schemas";
import { executeAdminStudentImportBatch } from "@/services/student-imports/service";

interface RouteContext {
  params: Promise<{ batchId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { batchId } = await context.params;
  const parsedId = studentImportBatchIdSchema.safeParse(batchId);
  if (!parsedId.success) {
    return apiError("导入批次 ID 格式无效", 400);
  }

  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(
      await executeAdminStudentImportBatch(
        admin.id,
        parsedId.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return studentImportApiError(error);
  }
}
