import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseSurveyApiError } from "@/lib/course-survey-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { courseSurveyIdSchema } from "@/services/course-surveys/schemas";
import { closeCourseSurvey } from "@/services/course-surveys/service";

type Context = { params: Promise<{ courseId: string; surveyId: string }> };

export async function POST(request: Request, context: Context) {
  const raw = await context.params;
  const courseId = courseIdSchema.safeParse(raw.courseId);
  const surveyId = courseSurveyIdSchema.safeParse(raw.surveyId);
  if (!courseId.success || !surveyId.success)
    return apiError("问卷参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await closeCourseSurvey(
        teacher.id,
        courseId.data,
        surveyId.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return courseSurveyApiError(error);
  }
}
