import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  previewStandaloneWorkbook,
  previewStandaloneQualityReport,
} from "@/services/quality-reports/standalone";

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    if (Number(request.headers.get("content-length") ?? 0) > 22 * 1024 * 1024)
      return apiError("上传文件总大小超过 22 MB。", 413);
    const form = await request.formData();
    if (form.has("input")) {
      let input: unknown;
      try {
        input = JSON.parse(String(form.get("input")));
      } catch {
        return apiError("报告设置格式无效。", 400);
      }
      const grade = form.get("grade"),
        survey = form.get("survey");
      return apiSuccess(
        await previewStandaloneQualityReport(
          teacher.id,
          input,
          grade instanceof File ? grade : null,
          survey instanceof File ? survey : null,
        ),
      );
    }
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("请选择数据文件。", 400);
    return apiSuccess(await previewStandaloneWorkbook(file));
  } catch (error) {
    return qualityReportApiError(error);
  }
}
