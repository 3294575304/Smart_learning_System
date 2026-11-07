import { Role } from "@prisma/client";
import { apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { listStudentExams } from "@/services/exams/service";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await listStudentExams(user.id));
  } catch (error) {
    return assignmentApiError(error);
  }
}
