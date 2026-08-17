import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseSurveyApiError } from "@/lib/course-survey-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseSurveyIdSchema } from "@/services/course-surveys/schemas";
import { getStudentCourseSurvey } from "@/services/course-surveys/service";

type Context = { params: Promise<{ surveyId: string }> };

export async function GET(_request: Request, context: Context) {
  const surveyId = courseSurveyIdSchema.safeParse(
    (await context.params).surveyId,
  );
  if (!surveyId.success) return apiError("问卷 ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await getStudentCourseSurvey(student.id, surveyId.data));
  } catch (error) {
    return courseSurveyApiError(error);
  }
}
