import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { studentImportApiError } from "@/lib/student-import-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  rosterMutationSchema,
  rosterQuerySchema,
} from "@/services/course-rosters/schemas";
import {
  listCourseRoster,
  mutateCourseRoster,
} from "@/services/course-rosters/service";

type Context = { params: Promise<{ courseId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const id = courseIdSchema.safeParse((await context.params).courseId);
    const query = rosterQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!id.success || !query.success)
      return apiError("请检查课程或名单查询条件", 400);
    return apiSuccess(
      await listCourseRoster(teacher.id, id.data, query.data),
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    return studentImportApiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const id = courseIdSchema.safeParse((await context.params).courseId);
    const input = rosterMutationSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!id.success || !input.success)
      return apiError("请检查学号、姓名及操作信息", 400);
    return apiSuccess(
      await mutateCourseRoster(teacher.id, id.data, input.data),
    );
  } catch (error) {
    return studentImportApiError(error);
  }
}
