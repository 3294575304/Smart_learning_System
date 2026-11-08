import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { classroomApiError } from "@/lib/classroom-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { classroomIdSchema } from "@/services/classrooms/schemas";
import { getTeacherClassroomDeletionPreview } from "@/services/classrooms/deletion";

export async function GET(
  _request: Request,
  context: { params: Promise<{ classroomId: string }> },
) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const id = classroomIdSchema.safeParse((await context.params).classroomId);
    if (!id.success) return apiError("班级 ID 格式无效", 400);
    return apiSuccess(
      await getTeacherClassroomDeletionPreview(teacher.id, id.data),
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    return classroomApiError(error);
  }
}
