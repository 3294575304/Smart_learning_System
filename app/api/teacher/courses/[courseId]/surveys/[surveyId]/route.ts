import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseSurveyApiError } from "@/lib/course-survey-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  courseSurveyIdSchema,
  updateCourseSurveySchema,
} from "@/services/course-surveys/schemas";
import {
  getTeacherCourseSurvey,
  updateCourseSurveyDraft,
} from "@/services/course-surveys/service";

type Context = { params: Promise<{ courseId: string; surveyId: string }> };

function params(input: { courseId: string; surveyId: string }) {
  const courseId = courseIdSchema.safeParse(input.courseId);
  const surveyId = courseSurveyIdSchema.safeParse(input.surveyId);
  return courseId.success && surveyId.success
    ? { courseId: courseId.data, surveyId: surveyId.data }
    : null;
}

export async function GET(_request: Request, context: Context) {
  const parsed = params(await context.params);
  if (!parsed) return apiError("问卷参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getTeacherCourseSurvey(
        teacher.id,
        parsed.courseId,
        parsed.surveyId,
      ),
    );
  } catch (error) {
    return courseSurveyApiError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  const ids = params(await context.params);
  if (!ids) return apiError("问卷参数无效", 400);
  const body: unknown = await request.json().catch(() => null);
  const parsed = updateCourseSurveySchema.safeParse(body);
  if (!parsed.success)
    return apiError("请检查问卷信息", 400, parsed.error.flatten().fieldErrors);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await updateCourseSurveyDraft(
        teacher.id,
        ids.courseId,
        ids.surveyId,
        parsed.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return courseSurveyApiError(error);
  }
}
