import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  createSelfReflectionSchema,
  selfReflectionPathSchema,
} from "@/services/self-reflections/schemas";
import {
  createSelfReflection,
  listSelfReflections,
} from "@/services/self-reflections/service";

type Context = { params: Promise<{ courseId: string }> };

export async function GET(_request: Request, context: Context) {
  const path = selfReflectionPathSchema.safeParse(await context.params);
  if (!path.success) return apiError("课程 ID 格式无效", 400);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await listSelfReflections(student.id, path.data.courseId),
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  const path = selfReflectionPathSchema.safeParse(await context.params);
  const input = createSelfReflectionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!path.success) return apiError("课程 ID 格式无效", 400);
  if (!input.success)
    return apiError(
      "请检查自述内容",
      400,
      definedFieldErrors(input.error.flatten().fieldErrors),
    );
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      await createSelfReflection(student.id, path.data.courseId, input.data),
      201,
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}
