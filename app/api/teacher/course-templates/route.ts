import { Role } from "@prisma/client";

import { apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { listTeacherCourseTemplates } from "@/services/courses/service";

export async function GET() {
  try {
    const actor = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listTeacherCourseTemplates(actor.id));
  } catch (error: unknown) {
    return courseApiError(error);
  }
}
