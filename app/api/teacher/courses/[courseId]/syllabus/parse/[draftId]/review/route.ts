import { Role } from "@prisma/client";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { syllabusParseApiError } from "@/lib/syllabus-parse-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { courseIdSchema } from "@/services/courses/schemas";
import { saveTeacherSyllabusReview } from "@/services/syllabus-parsing/review-service";
import { saveSyllabusReviewSchema } from "@/services/syllabus-parsing/schemas";

const draftIdSchema = z.string().cuid("解析稿 ID 格式无效");

interface RouteContext {
  params: Promise<{ courseId: string; draftId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const params = await context.params;
  const courseId = courseIdSchema.safeParse(params.courseId);
  const draftId = draftIdSchema.safeParse(params.draftId);
  if (!courseId.success || !draftId.success) {
    return apiError("课程或解析稿 ID 格式无效", 400);
  }
  let teacherId: string;
  try {
    teacherId = (await requireAuthenticatedUser([Role.TEACHER])).id;
  } catch (error: unknown) {
    return syllabusParseApiError(error);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = saveSyllabusReviewSchema.safeParse(body);
  if (!input.success) {
    return apiError("审核稿参数无效", 400, input.error.flatten().fieldErrors);
  }
  try {
    return apiSuccess(
      await saveTeacherSyllabusReview(
        teacherId,
        courseId.data,
        draftId.data,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return syllabusParseApiError(error);
  }
}
