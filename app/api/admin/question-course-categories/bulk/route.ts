import { Role } from "@prisma/client";

import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseCategoryBulkInputSchema } from "@/services/question-course-categories/catalog-schemas";
import { createQuestionCourseCategoriesInBulk } from "@/services/question-course-categories/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = courseCategoryBulkInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "请检查要添加的课程分类",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }
  try {
    const actor = await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(
      await createQuestionCourseCategoriesInBulk(
        actor.id,
        parsed.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}
