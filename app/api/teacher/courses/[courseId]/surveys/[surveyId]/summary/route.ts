import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseSurveyApiError } from "@/lib/course-survey-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { courseSurveyIdSchema } from "@/services/course-surveys/schemas";
import {
  generateCourseSurveySummary,
  getLatestCourseSurveySummary,
} from "@/services/course-surveys/service";

type Context = { params: Promise<{ courseId: string; surveyId: string }> };

async function ids(context: Context) {
  const raw = await context.params;
  const courseId = courseIdSchema.safeParse(raw.courseId);
  const surveyId = courseSurveyIdSchema.safeParse(raw.surveyId);
  return courseId.success && surveyId.success
    ? { courseId: courseId.data, surveyId: surveyId.data }
    : null;
}

export async function GET(_request: Request, context: Context) {
  const parsed = await ids(context);
  if (!parsed) return apiError("问卷参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getLatestCourseSurveySummary(
        teacher.id,
        parsed.courseId,
        parsed.surveyId,
      ),
    );
  } catch (error) {
    return courseSurveyApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  const parsed = await ids(context);
  if (!parsed) return apiError("问卷参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await generateCourseSurveySummary(
        teacher.id,
        parsed.courseId,
        parsed.surveyId,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return courseSurveyApiError(error);
  }
}
