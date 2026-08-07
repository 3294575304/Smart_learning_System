import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { attendanceApiError } from "@/lib/attendance-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { createAttendanceSessionSchema } from "@/services/attendance/schemas";
import {
  createTeacherAttendanceSession,
  getTeacherCourseAttendance,
} from "@/services/attendance/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";

type Context = { params: Promise<{ courseId: string }> };
export async function GET(_request: Request, context: Context) {
  const id = courseIdSchema.safeParse((await context.params).courseId);
  if (!id.success) return apiError("课程 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await getTeacherCourseAttendance(teacher.id, id.data));
  } catch (error) {
    return attendanceApiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  const id = courseIdSchema.safeParse((await context.params).courseId);
  if (!id.success) return apiError("课程 ID 格式无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = createAttendanceSessionSchema.safeParse(body);
  if (!input.success)
    return apiError("签到场次参数无效", 400, input.error.flatten().fieldErrors);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await createTeacherAttendanceSession(
        teacher.id,
        id.data,
        input.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return attendanceApiError(error);
  }
}
