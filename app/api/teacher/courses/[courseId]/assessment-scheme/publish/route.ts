import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assessmentSchemeApiError } from "@/lib/assessment-scheme-api";
import { publishAssessmentSchemeSchema } from "@/services/assessment-schemes/schemas";
import { publishTeacherAssessmentScheme } from "@/services/assessment-schemes/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { courseIdSchema } from "@/services/courses/schemas";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { courseId: rawCourseId } = await context.params;
  const courseId = courseIdSchema.safeParse(rawCourseId);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = publishAssessmentSchemeSchema.safeParse(body);
  if (!input.success) {
    return apiError("发布参数无效", 400, input.error.flatten().fieldErrors);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await publishTeacherAssessmentScheme(
        teacher.id,
        courseId.data,
        input.data.reviewRevisionId,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return assessmentSchemeApiError(error);
  }
}
