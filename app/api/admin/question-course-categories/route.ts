import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { questionCourseCategoryInputSchema } from "@/services/question-course-categories/schemas";
import {
  createQuestionCourseCategory,
  listQuestionCourseCategories,
} from "@/services/question-course-categories/service";

export async function GET() {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(await listQuestionCourseCategories(false));
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = questionCourseCategoryInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "请检查课程分类名称",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }
  try {
    const actor = await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(
      await createQuestionCourseCategory(
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
