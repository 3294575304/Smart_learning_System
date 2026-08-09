import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { conceptMasteryApiError } from "@/lib/concept-mastery-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { teacherProfilePathSchema } from "@/services/learner-profiles/schemas";
import { getTeacherStudentLearnerProfile } from "@/services/learner-profiles/service";

type Context = { params: Promise<{ courseId: string; studentId: string }> };

export async function GET(_request: Request, context: Context) {
  const path = teacherProfilePathSchema.safeParse(await context.params);
  if (!path.success) return apiError("课程或学生 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getTeacherStudentLearnerProfile(
        teacher.id,
        path.data.courseId,
        path.data.studentId,
      ),
    );
  } catch (error) {
    return conceptMasteryApiError(error);
  }
}
