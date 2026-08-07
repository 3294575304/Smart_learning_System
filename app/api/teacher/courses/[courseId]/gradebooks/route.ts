import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { gradebookApiError } from "@/lib/gradebook-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { createGradebookSchema } from "@/services/gradebook/schemas";
import {
  createTeacherCourseGradebook,
  listTeacherCourseGradebooks,
} from "@/services/gradebook/service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const courseId = courseIdSchema.safeParse((await context.params).courseId);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await listTeacherCourseGradebooks(teacher.id, courseId.data),
    );
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const courseId = courseIdSchema.safeParse((await context.params).courseId);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = createGradebookSchema.safeParse(body);
  if (!input.success) {
    return apiError("创建参数无效", 400, input.error.flatten().fieldErrors);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await createTeacherCourseGradebook(
        teacher.id,
        courseId.data,
        input.data.classroomId,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}
