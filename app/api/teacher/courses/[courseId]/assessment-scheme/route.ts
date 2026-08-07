import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assessmentSchemeApiError } from "@/lib/assessment-scheme-api";
import {
  generateAssessmentSchemeSchema,
  saveAssessmentSchemeSchema,
} from "@/services/assessment-schemes/schemas";
import {
  generateTeacherAssessmentSchemeDraft,
  getTeacherAssessmentSchemeWorkspace,
  saveTeacherAssessmentSchemeDraft,
} from "@/services/assessment-schemes/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { courseIdSchema } from "@/services/courses/schemas";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

async function paramsOrError(context: RouteContext) {
  const { courseId } = await context.params;
  return courseIdSchema.safeParse(courseId);
}

export async function GET(_request: Request, context: RouteContext) {
  const courseId = await paramsOrError(context);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getTeacherAssessmentSchemeWorkspace(teacher.id, courseId.data),
    );
  } catch (error: unknown) {
    return assessmentSchemeApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const courseId = await paramsOrError(context);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const input = generateAssessmentSchemeSchema.safeParse(body);
  if (!input.success) {
    return apiError("生成参数无效", 400, input.error.flatten().fieldErrors);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await generateTeacherAssessmentSchemeDraft(
        teacher.id,
        courseId.data,
        input.data.force,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return assessmentSchemeApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const courseId = await paramsOrError(context);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = saveAssessmentSchemeSchema.safeParse(body);
  if (!input.success) {
    return apiError("考核方案参数无效", 400, input.error.flatten().fieldErrors);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await saveTeacherAssessmentSchemeDraft(
        teacher.id,
        courseId.data,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return assessmentSchemeApiError(error);
  }
}
