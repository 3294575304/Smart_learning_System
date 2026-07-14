import { Role } from "@prisma/client";

import { classroomApiError } from "@/lib/classroom-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  classroomIdSchema,
  membershipIdSchema,
} from "@/services/classrooms/schemas";
import { removeClassroomStudent } from "@/services/classrooms/service";

interface RouteContext {
  params: Promise<{ classroomId: string; membershipId: string }>;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const params = await context.params;
  const parsedClassroomId = classroomIdSchema.safeParse(params.classroomId);
  const parsedMembershipId = membershipIdSchema.safeParse(params.membershipId);
  if (!parsedClassroomId.success || !parsedMembershipId.success) {
    return apiError("班级或成员 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await removeClassroomStudent(
        teacher.id,
        parsedClassroomId.data,
        parsedMembershipId.data,
      ),
    );
  } catch (error: unknown) {
    return classroomApiError(error);
  }
}
