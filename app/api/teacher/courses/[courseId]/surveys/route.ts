import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseSurveyApiError } from "@/lib/course-survey-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  courseSurveyListQuerySchema,
  createCourseSurveySchema,
} from "@/services/course-surveys/schemas";
import {
  createCourseSurveyDraft,
  listTeacherCourseSurveys,
} from "@/services/course-surveys/service";

type Context = { params: Promise<{ courseId: string }> };

export async function GET(request: Request, context: Context) {
  const courseId = courseIdSchema.safeParse((await context.params).courseId);
  const query = courseSurveyListQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!courseId.success || !query.success)
    return apiError("问卷筛选参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await listTeacherCourseSurveys(teacher.id, courseId.data, query.data),
    );
  } catch (error) {
    return courseSurveyApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  const courseId = courseIdSchema.safeParse((await context.params).courseId);
  if (!courseId.success) return apiError("课程 ID 格式无效", 400);
  const body: unknown = await request.json().catch(() => null);
  const parsed = createCourseSurveySchema.safeParse(body);
  if (!parsed.success)
    return apiError("请检查问卷信息", 400, parsed.error.flatten().fieldErrors);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await createCourseSurveyDraft(
        teacher.id,
        courseId.data,
        parsed.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return courseSurveyApiError(error);
  }
}
