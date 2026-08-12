import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  courseRecommendationPathSchema,
  courseTeachingProgressSchema,
} from "@/services/course-recommendations/schemas";
import {
  getTeachingProgress,
  updateTeachingProgress,
} from "@/services/course-recommendations/service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const path = courseRecommendationPathSchema.safeParse(await context.params);
  if (!path.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getTeachingProgress(teacher.id, path.data.courseId),
    );
  } catch (error: unknown) {
    return recommendationApiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const path = courseRecommendationPathSchema.safeParse(await context.params);
  const input = courseTeachingProgressSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success) return apiError("课程 ID 格式无效", 400);
  if (!input.success)
    return apiError(
      "请检查教学进度配置",
      400,
      definedFieldErrors(input.error.flatten().fieldErrors),
    );
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await updateTeachingProgress(
        teacher.id,
        path.data.courseId,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return recommendationApiError(error);
  }
}
