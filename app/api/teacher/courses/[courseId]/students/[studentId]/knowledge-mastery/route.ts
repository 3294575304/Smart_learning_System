import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { conceptMasteryApiError } from "@/lib/concept-mastery-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { teacherStudentCourseMasteryPathSchema } from "@/services/concept-mastery/schemas";
import { getTeacherStudentCourseConceptMastery } from "@/services/concept-mastery/service";

interface Context {
  params: Promise<{ courseId: string; studentId: string }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const path = teacherStudentCourseMasteryPathSchema.safeParse(
      await context.params,
    );
    if (!path.success) return apiError("课程或学生 ID 格式无效", 400);
    return apiSuccess(
      await getTeacherStudentCourseConceptMastery(
        teacher.id,
        path.data.courseId,
        path.data.studentId,
      ),
    );
  } catch (error: unknown) {
    return conceptMasteryApiError(error);
  }
}
