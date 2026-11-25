import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getStandaloneSyllabusParse } from "@/services/quality-reports/standalone-syllabus";

type Context = { params: Promise<{ jobId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const { jobId } = await context.params;
    if (!/^c[a-z0-9]{20,}$/u.test(jobId))
      return apiError("任务参数无效。", 400);
    return apiSuccess(await getStandaloneSyllabusParse(teacher.id, jobId));
  } catch (error) {
    return qualityReportApiError(error);
  }
}
