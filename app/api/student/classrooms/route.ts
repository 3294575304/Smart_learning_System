import { Role } from "@prisma/client";

import { classroomApiError } from "@/lib/classroom-api";
import { apiSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { listStudentClassrooms } from "@/services/classrooms/service";

export async function GET() {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await listStudentClassrooms(student.id));
  } catch (error: unknown) {
    return classroomApiError(error);
  }
}
