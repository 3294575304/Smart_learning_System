import { Role } from "@prisma/client";

import { apiError } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { downloadTeacherQualityReport } from "@/services/quality-reports/service";

type Context = { params: Promise<{ courseId: string; reportId: string }> };

export async function GET(request: Request, context: Context) {
  const params = await context.params;
  const courseId = courseIdSchema.safeParse(params.courseId);
  if (!courseId.success || !/^c[a-z0-9]{20,}$/u.test(params.reportId))
    return apiError("报告参数无效", 400);
  const artifact = new URL(request.url).searchParams.get("artifact");
  if (artifact !== "draft-docx" && artifact !== "docx" && artifact !== "xlsx")
    return apiError("下载类型无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const file = await downloadTeacherQualityReport(
      teacher.id,
      courseId.data,
      params.reportId,
      artifact,
      auditRequestContext(request),
    );
    const encoded = encodeURIComponent(file.fileName);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type":
          artifact === "docx" || artifact === "draft-docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return qualityReportApiError(error);
  }
}
