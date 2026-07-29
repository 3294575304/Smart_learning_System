import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseTemplateIdSchema } from "@/services/courses/schemas";
import { setAdminCourseTemplateActive } from "@/services/courses/service";

interface RouteContext {
  params: Promise<{ templateId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { templateId } = await context.params;
  const parsedId = courseTemplateIdSchema.safeParse(templateId);
  if (!parsedId.success) {
    return apiError("课程模板 ID 格式无效", 400);
  }

  try {
    const actor = await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(
      await setAdminCourseTemplateActive(
        actor.id,
        parsedId.data,
        false,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}
