import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { syllabusParseApiError } from "@/lib/syllabus-parse-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { scheduleBackgroundWorkerWakeup } from "@/services/background-jobs/wakeup";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  getTeacherSyllabusParses,
  queueTeacherSyllabusParse,
} from "@/services/syllabus-parsing/service";
import {
  getLatestTeacherSyllabusReview,
  getTeacherPublishedSyllabi,
} from "@/services/syllabus-parsing/review-service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

async function parsedCourseId(context: RouteContext) {
  const { courseId } = await context.params;
  return courseIdSchema.safeParse(courseId);
}

export async function GET(_request: Request, context: RouteContext) {
  const parsedId = await parsedCourseId(context);
  if (!parsedId.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const parses = await getTeacherSyllabusParses(teacher.id, parsedId.data);
    const review =
      parses.current?.status === "SUCCEEDED" &&
      parses.current.hasFieldSourceRefs
        ? await getLatestTeacherSyllabusReview(
            teacher.id,
            parsedId.data,
            parses.current.id,
          )
        : null;
    const published = await getTeacherPublishedSyllabi(
      teacher.id,
      parsedId.data,
      review?.id ?? null,
    );
    return apiSuccess({ ...parses, review, published });
  } catch (error: unknown) {
    return syllabusParseApiError(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const parsedId = await parsedCourseId(context);
  if (!parsedId.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const result = await queueTeacherSyllabusParse(teacher.id, parsedId.data);
    if (result.shouldExecute) scheduleBackgroundWorkerWakeup();
    return apiSuccess(result, result.shouldExecute ? 202 : 200);
  } catch (error: unknown) {
    return syllabusParseApiError(error);
  }
}
