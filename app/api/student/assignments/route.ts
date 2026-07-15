import { Role } from "@prisma/client";

import { apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { listStudentAssignments } from "@/services/assignments/service";

export async function GET() {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await listStudentAssignments(student.id));
  } catch (error: unknown) {
    return assignmentApiError(error);
  }
}
