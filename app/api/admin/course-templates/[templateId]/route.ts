import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  courseTemplateIdSchema,
  updateCourseTemplateSchema,
} from "@/services/courses/schemas";
import {
  getAdminCourseTemplate,
  updateAdminCourseTemplate,
} from "@/services/courses/service";

interface RouteContext {
  params: Promise<{ templateId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { templateId } = await context.params;
  const parsedId = courseTemplateIdSchema.safeParse(templateId);
  if (!parsedId.success) {
    return apiError("课程模板 ID 格式无效", 400);
  }

  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(await getAdminCourseTemplate(parsedId.data));
  } catch (error: unknown) {
    return courseApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { templateId } = await context.params;
  const parsedId = courseTemplateIdSchema.safeParse(templateId);
  const body: unknown = await request.json().catch(() => null);
  const parsedInput = updateCourseTemplateSchema.safeParse(body);

  if (!parsedId.success) {
    return apiError("课程模板 ID 格式无效", 400);
  }
  if (!parsedInput.success) {
    return apiError(
      "请检查课程模板信息",
      400,
      definedFieldErrors(parsedInput.error.flatten().fieldErrors),
    );
  }

  try {
    const actor = await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(
      await updateAdminCourseTemplate(
        actor.id,
        parsedId.data,
        parsedInput.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}
