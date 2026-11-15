import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { attendanceApiError } from "@/lib/attendance-api";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  attendanceSessionIdSchema,
  studentAttendanceSignInSchema,
} from "@/services/attendance/schemas";
import { signStudentAttendance } from "@/services/attendance/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
type Context = { params: Promise<{ sessionId: string }> };
export async function POST(request: Request, context: Context) {
  const id = attendanceSessionIdSchema.safeParse(
    (await context.params).sessionId,
  );
  if (!id.success) return apiError("签到场次 ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    let body: unknown = { method: "DIRECT" };
    if (request.headers.get("content-type")?.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        return apiError("请求内容必须是合法 JSON", 400);
      }
    }
    const input = studentAttendanceSignInSchema.safeParse(body);
    if (!input.success)
      return apiError("签到参数无效", 400, input.error.flatten().fieldErrors);
    return apiSuccess(
      await signStudentAttendance(
        student.id,
        id.data,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return attendanceApiError(error);
  }
}
