import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  selfReflectionPathSchema,
  updateSelfReflectionSchema,
} from "@/services/self-reflections/schemas";
import {
  confirmSelfReflection,
  deleteSelfReflection,
} from "@/services/self-reflections/service";

type Context = { params: Promise<{ courseId: string; reflectionId: string }> };

export async function PATCH(request: Request, context: Context) {
  const path = selfReflectionPathSchema.safeParse(await context.params);
  const input = updateSelfReflectionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success || !path.data.reflectionId)
    return apiError("资源 ID 格式无效", 400);
  if (!input.success)
    return apiError(
      "请检查反思内容",
      400,
      definedFieldErrors(input.error.flatten().fieldErrors),
    );
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await confirmSelfReflection(
        student.id,
        path.data.courseId,
        path.data.reflectionId,
        input.data,
      ),
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const path = selfReflectionPathSchema.safeParse(await context.params);
  if (!path.success || !path.data.reflectionId)
    return apiError("资源 ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await deleteSelfReflection(
        student.id,
        path.data.courseId,
        path.data.reflectionId,
      ),
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
