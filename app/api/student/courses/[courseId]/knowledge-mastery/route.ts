import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { conceptMasteryApiError } from "@/lib/concept-mastery-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { studentCourseMasteryPathSchema } from "@/services/concept-mastery/schemas";
import { getStudentCourseConceptMastery } from "@/services/concept-mastery/service";

interface Context {
  params: Promise<{ courseId: string }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const path = studentCourseMasteryPathSchema.safeParse(await context.params);
    if (!path.success) return apiError("课程 ID 格式无效", 400);
    return apiSuccess(
      await getStudentCourseConceptMastery(student.id, path.data.courseId),
    );
  } catch (error: unknown) {
    return conceptMasteryApiError(error);
  }
}
