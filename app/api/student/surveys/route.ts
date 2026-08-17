import { Role } from "@prisma/client";

import { apiSuccess } from "@/lib/api-response";
import { courseSurveyApiError } from "@/lib/course-survey-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { listStudentCourseSurveys } from "@/services/course-surveys/service";

export async function GET() {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await listStudentCourseSurveys(student.id));
  } catch (error) {
    return courseSurveyApiError(error);
  }
}
