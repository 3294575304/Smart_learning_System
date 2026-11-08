import { AuditAction, AuditTargetType, Role } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import { getTeacherExamAnalysisVersion } from "@/services/exams/analysis";
import { buildExamAnalysisXlsx } from "@/services/exams/analysis-xlsx";
import { buildExamCommentaryPdf } from "@/services/exams/analysis-pdf";

export async function GET(
  request: Request,
  context: { params: Promise<{ examId: string; revision: string }> },
) {
  const parsed = z
    .object({
      examId: z.string().cuid(),
      revision: z.coerce.number().int().positive(),
    })
    .safeParse(await context.params);
  if (!parsed.success) return apiError("考试分析版本无效", 400);
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "xlsx" && format !== "pdf")
    return apiError("导出格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const version = await getTeacherExamAnalysisVersion(
      teacher.id,
      parsed.data.examId,
      parsed.data.revision,
    );
    const data =
      format === "xlsx"
        ? buildExamAnalysisXlsx(version.snapshot)
        : await buildExamCommentaryPdf(version.snapshot, teacher.id);
    await prisma.$transaction(async (tx) =>
      writeTeachingAuditLog(tx, {
        actorId: teacher.id,
        action: AuditAction.EXAM_ANALYSIS_DOWNLOADED,
        targetType: AuditTargetType.EXAM_SESSION,
        targetId: parsed.data.examId,
        summary: "下载考试分析",
        beforeData: null,
        afterData: { revision: version.revision, format },
        context: auditRequestContext(request),
      }),
    );
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type":
          format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${version.snapshot.title}-分析-v${version.revision}.${format}`)}`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return assignmentApiError(error);
  }
}
