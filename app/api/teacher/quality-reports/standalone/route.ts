import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { scheduleBackgroundWorkerWakeup } from "@/services/background-jobs/wakeup";
import {
  listStandaloneQualityReports,
  queueStandaloneQualityReport,
} from "@/services/quality-reports/standalone";

export async function GET() {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listStandaloneQualityReports(teacher.id));
  } catch (error) {
    return qualityReportApiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    if (Number(request.headers.get("content-length") ?? 0) > 22 * 1024 * 1024)
      return apiError("上传文件总大小超过 22 MB。", 413);
    const form = await request.formData();
    let input: unknown;
    try {
      input = JSON.parse(String(form.get("input") ?? ""));
    } catch {
      return apiError("报告设置格式无效。", 400);
    }
    const grade = form.get("grade"),
      survey = form.get("survey");
    const queued = await queueStandaloneQualityReport(
      teacher.id,
      input,
      grade instanceof File ? grade : null,
      survey instanceof File ? survey : null,
      auditRequestContext(request),
    );
    if (queued.shouldExecute) scheduleBackgroundWorkerWakeup();
    return apiSuccess(queued, queued.reused ? 200 : 202);
  } catch (error) {
    return qualityReportApiError(error);
  }
}
