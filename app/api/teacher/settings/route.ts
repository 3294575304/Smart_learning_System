import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  setTeacherDefaultCourse,
  setTeacherTeachingPreferences,
} from "@/services/dashboard/teacher-settings";
import { teacherSettingsPatchSchema } from "@/services/dashboard/teacher-settings-schemas";

export async function PATCH(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const input = teacherSettingsPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success) return apiError("设置参数无效，请核对后重试", 400);
    if ("teachingPreferences" in input.data) {
      return apiSuccess(
        await setTeacherTeachingPreferences(
          teacher.id,
          input.data.teachingPreferences,
        ),
      );
    }
    return apiSuccess(
      await setTeacherDefaultCourse(teacher.id, input.data.defaultCourseId),
    );
  } catch (error) {
    return courseApiError(error);
  }
}
