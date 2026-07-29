import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { definedFieldErrors } from "@/lib/zod-errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { createCourseTemplateSchema } from "@/services/courses/schemas";
import {
  createAdminCourseTemplate,
  listAdminCourseTemplates,
} from "@/services/courses/service";

export async function GET() {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(await listAdminCourseTemplates());
  } catch (error: unknown) {
    return courseApiError(error);
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = createCourseTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "请检查课程模板信息",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }

  try {
    const actor = await requireAuthenticatedUser([Role.ADMIN]);
    return apiSuccess(
      await createAdminCourseTemplate(
        actor.id,
        parsed.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}
