import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseFileApiError } from "@/lib/course-file-api";
import { formDataFile } from "@/lib/form-data-file";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  listTeacherCourseStudentRosterFiles,
  uploadTeacherCourseStudentRosterFile,
} from "@/services/course-files/service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    return apiError("课程 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await listTeacherCourseStudentRosterFiles(teacher.id, parsedId.data),
    );
  } catch (error: unknown) {
    return courseFileApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    return apiError("课程 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const formData = await request.formData().catch(() => null);
    const file = formDataFile(formData?.get("file") ?? null);

    return apiSuccess(
      await uploadTeacherCourseStudentRosterFile(
        teacher.id,
        parsedId.data,
        file,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return courseFileApiError(error);
  }
}
