import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  courseRecommendationGenerationSchema,
  courseRecommendationPathSchema,
} from "@/services/course-recommendations/schemas";
import { createCourseRecommendations } from "@/services/course-recommendations/service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const path = courseRecommendationPathSchema.safeParse(await context.params);
  const input = courseRecommendationGenerationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success) return apiError("课程 ID 格式无效", 400);
  if (!input.success)
    return apiError(
      "请检查自主练习条件",
      400,
      definedFieldErrors(input.error.flatten().fieldErrors),
    );
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await createCourseRecommendations(
        student,
        path.data.courseId,
        input.data,
      ),
    );
  } catch (error: unknown) {
    return recommendationApiError(error);
  }
}
