import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { approveTeacherQualityReport } from "@/services/quality-reports/service";

type Context = { params: Promise<{ reportId: string }> };
export async function PATCH(request: Request, context: Context) {
  const { reportId } = await context.params;
  if (!/^c[a-z0-9]{20,}$/u.test(reportId)) return apiError("报告参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("请求内容必须是合法 JSON", 400);
    }
    return apiSuccess(
      await approveTeacherQualityReport(
        teacher.id,
        null,
        reportId,
        body,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return qualityReportApiError(error);
  }
}
