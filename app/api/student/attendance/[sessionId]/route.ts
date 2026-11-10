import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { attendanceApiError } from "@/lib/attendance-api";
import { attendanceSessionIdSchema } from "@/services/attendance/schemas";
import { getStudentAttendanceSession } from "@/services/attendance/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const sessionId = attendanceSessionIdSchema.safeParse(
      (await params).sessionId,
    );
    if (!sessionId.success) return apiError("签到场次 ID 格式无效", 400);
    return apiSuccess(
      {
        records: [
          await getStudentAttendanceSession(student.id, sessionId.data),
        ],
      },
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    return attendanceApiError(error);
  }
}
