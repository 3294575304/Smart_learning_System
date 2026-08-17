import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseSurveyApiError } from "@/lib/course-survey-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  courseSurveyIdSchema,
  submitCourseSurveySchema,
} from "@/services/course-surveys/schemas";
import { submitCourseSurveyResponse } from "@/services/course-surveys/service";

type Context = { params: Promise<{ surveyId: string }> };

export async function POST(request: Request, context: Context) {
  const surveyId = courseSurveyIdSchema.safeParse(
    (await context.params).surveyId,
  );
  const body = submitCourseSurveySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!surveyId.success || !body.success) {
    return apiError(
      "请检查问卷回答",
      400,
      body.success ? undefined : body.error.flatten().fieldErrors,
    );
  }
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await submitCourseSurveyResponse(
        student.id,
        surveyId.data,
        body.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return courseSurveyApiError(error);
  }
}
