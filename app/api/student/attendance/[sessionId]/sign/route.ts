import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { attendanceApiError } from "@/lib/attendance-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { attendanceSessionIdSchema } from "@/services/attendance/schemas";
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
    return apiSuccess(
      await signStudentAttendance(
        student.id,
        id.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return attendanceApiError(error);
  }
}
