import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { attendanceApiError } from "@/lib/attendance-api";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  attendanceRecordIdSchema,
  attendanceSessionIdSchema,
  correctAttendanceRecordSchema,
} from "@/services/attendance/schemas";
import { correctTeacherAttendanceRecord } from "@/services/attendance/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
type Context = { params: Promise<{ sessionId: string; recordId: string }> };
export async function PUT(request: Request, context: Context) {
  const values = await context.params;
  const sessionId = attendanceSessionIdSchema.safeParse(values.sessionId);
  const recordId = attendanceRecordIdSchema.safeParse(values.recordId);
  if (!sessionId.success || !recordId.success)
    return apiError("签到场次或出勤记录 ID 格式无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = correctAttendanceRecordSchema.safeParse(body);
  if (!input.success)
    return apiError("出勤纠正参数无效", 400, input.error.flatten().fieldErrors);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await correctTeacherAttendanceRecord(
        teacher.id,
        sessionId.data,
        recordId.data,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return attendanceApiError(error);
  }
}
