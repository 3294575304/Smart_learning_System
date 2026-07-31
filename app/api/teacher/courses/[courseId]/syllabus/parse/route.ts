import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { syllabusParseApiError } from "@/lib/syllabus-parse-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  createTeacherSyllabusParse,
  getTeacherSyllabusParses,
} from "@/services/syllabus-parsing/service";

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
    return apiSuccess(
      await getTeacherSyllabusParses(teacher.id, parsedId.data),
    );
  } catch (error: unknown) {
    return syllabusParseApiError(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const parsedId = await parsedCourseId(context);
  if (!parsedId.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const result = await createTeacherSyllabusParse(teacher.id, parsedId.data);
    return apiSuccess(result, result.reused ? 200 : 201);
  } catch (error: unknown) {
    return syllabusParseApiError(error);
  }
}
