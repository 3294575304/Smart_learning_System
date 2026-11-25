import { Role } from "@prisma/client";

import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { previewCourseCategoryImport } from "@/services/question-course-categories/catalog-import-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedUser([Role.ADMIN]);
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File)) {
      return apiError("请选择要识别的教学计划表。", 400);
    }
    return apiSuccess(await previewCourseCategoryImport(actor.id, file));
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}
