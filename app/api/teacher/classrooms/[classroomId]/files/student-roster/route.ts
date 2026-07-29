import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseFileApiError } from "@/lib/course-file-api";
import { formDataFile } from "@/lib/form-data-file";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { classroomIdSchema } from "@/services/classrooms/schemas";
import {
  listTeacherClassroomStudentRosterFiles,
  uploadTeacherClassroomStudentRosterFile,
} from "@/services/course-files/service";

interface RouteContext {
  params: Promise<{ classroomId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { classroomId } = await context.params;
  const parsedId = classroomIdSchema.safeParse(classroomId);
  if (!parsedId.success) {
    return apiError("班级 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await listTeacherClassroomStudentRosterFiles(teacher.id, parsedId.data),
    );
  } catch (error: unknown) {
    return courseFileApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { classroomId } = await context.params;
  const parsedId = classroomIdSchema.safeParse(classroomId);
  if (!parsedId.success) {
    return apiError("班级 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const formData = await request.formData().catch(() => null);
    const file = formDataFile(formData?.get("file") ?? null);

    return apiSuccess(
      await uploadTeacherClassroomStudentRosterFile(
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
