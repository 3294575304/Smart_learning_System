import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  courseRecommendationPathSchema,
  courseRecommendationPolicySchema,
} from "@/services/course-recommendations/schemas";
import {
  getRecommendationPolicy,
  updateRecommendationPolicy,
} from "@/services/course-recommendations/service";

type Context = { params: Promise<{ courseId: string }> };
export async function GET(_request: Request, context: Context) {
  const path = courseRecommendationPathSchema.safeParse(await context.params);
  if (!path.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getRecommendationPolicy(teacher.id, path.data.courseId),
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
export async function PUT(request: Request, context: Context) {
  const path = courseRecommendationPathSchema.safeParse(await context.params);
  const input = courseRecommendationPolicySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success || !input.success)
    return apiError("请检查推荐策略，六项权重之和必须为 100%", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await updateRecommendationPolicy(
        teacher.id,
        path.data.courseId,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
