import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { submissionIdSchema } from "@/services/assignments/schemas";
import { createPublicProgrammingRunSchema } from "@/services/programming-attempts/schemas";
import { createPublicProgrammingRun } from "@/services/programming-attempts/service";

type Context = { params: Promise<{ submissionId: string }> };

export async function POST(request: Request, context: Context) {
  const submissionId = submissionIdSchema.safeParse(
    (await context.params).submissionId,
  );
  const body = createPublicProgrammingRunSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!submissionId.success || !body.success) {
    return apiError("请检查公开样例运行参数", 400);
  }
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await createPublicProgrammingRun(
        student.id,
        submissionId.data,
        body.data,
      ),
      202,
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
