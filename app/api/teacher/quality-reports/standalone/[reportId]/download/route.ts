import { Role } from "@prisma/client";
import { apiError } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { downloadTeacherQualityReport } from "@/services/quality-reports/service";

type Context = { params: Promise<{ reportId: string }> };
export async function GET(request: Request, context: Context) {
  const { reportId } = await context.params;
  if (!/^c[a-z0-9]{20,}$/u.test(reportId)) return apiError("报告参数无效", 400);
  const artifact = new URL(request.url).searchParams.get("artifact");
  if (artifact !== "draft-docx" && artifact !== "docx" && artifact !== "xlsx")
    return apiError("下载类型无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const file = await downloadTeacherQualityReport(
      teacher.id,
      null,
      reportId,
      artifact,
      auditRequestContext(request),
    );
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type":
          artifact === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return qualityReportApiError(error);
  }
}
