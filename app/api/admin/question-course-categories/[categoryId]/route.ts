import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  questionCourseCategoryIdSchema,
  questionCourseCategoryUpdateSchema,
} from "@/services/question-course-categories/schemas";
import { updateQuestionCourseCategory } from "@/services/question-course-categories/service";

interface RouteContext {
  params: Promise<{ categoryId: string }>;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { categoryId: rawId } = await params;
  const categoryId = questionCourseCategoryIdSchema.safeParse(rawId);
  if (!categoryId.success) return apiError("课程分类不存在", 404);
  const body: unknown = await request.json().catch(() => null);
  const parsed = questionCourseCategoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "请检查课程分类信息",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }
  try {
    const actor = await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(
      await updateQuestionCourseCategory(
        actor.id,
        categoryId.data,
        parsed.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return adminGovernanceApiError(error);
  }
}
