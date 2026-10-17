import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  listReportTemplates,
  uploadReportTemplate,
} from "@/services/quality-reports/template-service";

type Context = { params: Promise<{ courseId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const courseId = courseIdSchema.parse((await context.params).courseId);
    return apiSuccess(await listReportTemplates(teacher.id, courseId));
  } catch (error) {
    return qualityReportApiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const courseId = courseIdSchema.parse((await context.params).courseId);
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return apiError("请选择 DOCX 报告模板。", 400);
    return apiSuccess(
      await uploadReportTemplate(
        teacher.id,
        courseId,
        file,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return qualityReportApiError(error);
  }
}
