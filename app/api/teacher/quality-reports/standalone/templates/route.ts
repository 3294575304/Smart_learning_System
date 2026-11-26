import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  listReportTemplates,
  uploadReportTemplate,
} from "@/services/quality-reports/template-service";

export async function GET() {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listReportTemplates(teacher.id, null));
  } catch (error) {
    return qualityReportApiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return apiError("请选择 DOCX 模板。", 400);
    return apiSuccess(
      await uploadReportTemplate(
        teacher.id,
        null,
        file,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return qualityReportApiError(error);
  }
}
