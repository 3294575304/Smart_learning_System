import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { attendanceApiError } from "@/lib/attendance-api";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  attendanceSessionIdSchema,
  updateAttendanceSessionSchema,
} from "@/services/attendance/schemas";
import { updateTeacherAttendanceSession } from "@/services/attendance/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
type Context = { params: Promise<{ sessionId: string }> };
export async function PATCH(request: Request, context: Context) {
  const id = attendanceSessionIdSchema.safeParse(
    (await context.params).sessionId,
  );
  if (!id.success) return apiError("签到场次 ID 格式无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = updateAttendanceSessionSchema.safeParse(body);
  if (!input.success)
    return apiError(
      "签到场次操作参数无效",
      400,
      input.error.flatten().fieldErrors,
    );
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await updateTeacherAttendanceSession(
        teacher.id,
        id.data,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return attendanceApiError(error);
  }
}
