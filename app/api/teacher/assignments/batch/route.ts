import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { assignmentBatchSchema } from "@/services/assignments/schemas";
import { createAssignmentBatch } from "@/services/assignments/service";

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const parsed = assignmentBatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return apiError(
        parsed.error.issues[0]?.message ?? "请检查多班作业信息",
        400,
      );
    const result = await createAssignmentBatch(teacher.id, parsed.data);
    revalidatePath("/teacher");
    revalidatePath("/teacher/assignments");
    return apiSuccess(result, 201);
  } catch (error) {
    return assignmentApiError(error);
  }
}
