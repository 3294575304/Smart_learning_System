import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { scheduleBackgroundWorkerWakeup } from "@/services/background-jobs/wakeup";
import { queueStandaloneSyllabusParse } from "@/services/quality-reports/standalone-syllabus";

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    if (Number(request.headers.get("content-length") ?? 0) > 11 * 1024 * 1024)
      return apiError("教学大纲文件超过 10 MB。", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("请选择教学大纲文件。", 400);
    const queued = await queueStandaloneSyllabusParse(
      teacher.id,
      file,
      {
        courseName: String(form.get("courseName") ?? ""),
        courseNo: String(form.get("courseNo") ?? ""),
        term: String(form.get("term") ?? ""),
      },
      auditRequestContext(request),
    );
    if (queued.shouldExecute) scheduleBackgroundWorkerWakeup();
    return apiSuccess(queued, queued.reused ? 200 : 202);
  } catch (error) {
    return qualityReportApiError(error);
  }
}
