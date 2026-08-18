import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { approveTeacherQualityReport } from "@/services/quality-reports/service";

type Context = { params: Promise<{ courseId: string; reportId: string }> };

export async function PATCH(request: Request, context: Context) {
  const params = await context.params;
  const courseId = courseIdSchema.safeParse(params.courseId);
  if (!courseId.success || !/^c[a-z0-9]{20,}$/u.test(params.reportId))
    return apiError("报告参数无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await approveTeacherQualityReport(
        teacher.id,
        courseId.data,
        params.reportId,
        body,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return qualityReportApiError(error);
  }
}
