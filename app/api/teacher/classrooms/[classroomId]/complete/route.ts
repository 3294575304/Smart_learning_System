import { Role } from "@prisma/client";
import { auditRequestContext } from "@/services/audit/request-context";
import { classroomApiError } from "@/lib/classroom-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { classroomIdSchema } from "@/services/classrooms/schemas";
import { completeClassroom } from "@/services/classrooms/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ classroomId: string }> },
) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const id = classroomIdSchema.safeParse((await context.params).classroomId);
    if (!id.success) return apiError("班级 ID 格式无效", 400);
    return apiSuccess(
      await completeClassroom(
        teacher.id,
        id.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return classroomApiError(error);
  }
}
