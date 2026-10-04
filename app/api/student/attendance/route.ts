import { Role } from "@prisma/client";
import { apiSuccess } from "@/lib/api-response";
import { attendanceApiError } from "@/lib/attendance-api";
import { AttendanceOperationError } from "@/services/attendance/errors";
import { getStudentAttendance } from "@/services/attendance/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";

export async function GET(request: Request) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const rawCourseId = new URL(request.url).searchParams.get("courseId");
    const parsedCourseId =
      rawCourseId !== null ? courseIdSchema.safeParse(rawCourseId) : null;
    if (parsedCourseId && !parsedCourseId.success) {
      throw new AttendanceOperationError("课程 ID 格式无效。", 400);
    }
    return apiSuccess(
      await getStudentAttendance(
        student.id,
        parsedCourseId?.success ? parsedCourseId.data : undefined,
      ),
    );
  } catch (error) {
    return attendanceApiError(error);
  }
}
