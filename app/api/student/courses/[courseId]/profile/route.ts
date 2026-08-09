import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { conceptMasteryApiError } from "@/lib/concept-mastery-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { studentProfilePathSchema } from "@/services/learner-profiles/schemas";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";

type Context = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, context: Context) {
  const path = studentProfilePathSchema.safeParse(await context.params);
  if (!path.success) return apiError("课程 ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await getStudentLearnerProfile(student.id, path.data.courseId),
    );
  } catch (error) {
    return conceptMasteryApiError(error);
  }
}
