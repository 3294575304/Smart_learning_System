import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { classroomIdSchema, courseIdSchema } from "@/services/courses/schemas";
import {
  linkTeacherClassroomToCourse,
  unlinkTeacherClassroomFromCourse,
} from "@/services/courses/service";

interface RouteContext {
  params: Promise<{ courseId: string; classroomId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { courseId, classroomId } = await context.params;
  const parsedCourseId = courseIdSchema.safeParse(courseId);
  const parsedClassroomId = classroomIdSchema.safeParse(classroomId);
  if (!parsedCourseId.success) {
    return apiError("课程 ID 格式无效", 400);
  }
  if (!parsedClassroomId.success) {
    return apiError("班级 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await linkTeacherClassroomToCourse(
        teacher.id,
        parsedCourseId.data,
        parsedClassroomId.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { courseId, classroomId } = await context.params;
  const parsedCourseId = courseIdSchema.safeParse(courseId);
  const parsedClassroomId = classroomIdSchema.safeParse(classroomId);
  if (!parsedCourseId.success) {
    return apiError("课程 ID 格式无效", 400);
  }
  if (!parsedClassroomId.success) {
    return apiError("班级 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await unlinkTeacherClassroomFromCourse(
        teacher.id,
        parsedCourseId.data,
        parsedClassroomId.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}
