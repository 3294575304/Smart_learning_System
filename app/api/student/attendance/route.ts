import { Role } from "@prisma/client";
import { apiSuccess } from "@/lib/api-response";
import { attendanceApiError } from "@/lib/attendance-api";
import { getStudentAttendance } from "@/services/attendance/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
export async function GET() {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(await getStudentAttendance(student.id));
  } catch (error) {
    return attendanceApiError(error);
  }
}
