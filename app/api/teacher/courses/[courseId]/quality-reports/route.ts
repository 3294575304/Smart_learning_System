import { Role } from "@prisma/client";
import { after } from "next/server";

import { apiError, apiSuccess } from "@/lib/api-response";
import { qualityReportApiError } from "@/lib/quality-report-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  getTeacherQualityReports,
  processQualityReportJob,
  queuePlatformQualityReport,
  queueUploadedQualityReport,
} from "@/services/quality-reports/service";

type Context = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, context: Context) {
  const courseId = courseIdSchema.safeParse((await context.params).courseId);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getTeacherQualityReports(teacher.id, courseId.data),
    );
  } catch (error) {
    return qualityReportApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  const courseId = courseIdSchema.safeParse((await context.params).courseId);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const requestContext = auditRequestContext(request);
    const contentType = request.headers.get("content-type") ?? "";
    let queued;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      queued = await queueUploadedQualityReport(
        teacher.id,
        courseId.data,
        {
          sourceType: "UPLOAD",
          classroomId: String(form.get("classroomId") ?? "") || undefined,
          courseNature: String(form.get("courseNature") ?? ""),
          credits: String(form.get("credits") ?? "0"),
          majorClass: String(form.get("majorClass") ?? ""),
          college: String(form.get("college") ?? ""),
          major: String(form.get("major") ?? ""),
        },
        file instanceof File ? file : null,
        requestContext,
      );
    } else {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return apiError("请求内容必须是合法 JSON", 400);
      }
      queued = await queuePlatformQualityReport(
        teacher.id,
        courseId.data,
        body,
        requestContext,
      );
    }
    if (queued.shouldExecute) {
      const reportId = queued.report.id;
      after(async () => {
        try {
          await processQualityReportJob(reportId, requestContext);
        } catch {
          // Persistent task and report records expose a safe retryable failure.
        }
      });
    }
    return apiSuccess(queued, queued.reused ? 200 : 202);
  } catch (error) {
    return qualityReportApiError(error);
  }
}
