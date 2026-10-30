import { Role } from "@prisma/client";

import { announcementApiError } from "@/lib/announcement-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { courseAnnouncementBatchSchema } from "@/services/course-announcements/schemas";
import { duplicateCourseAnnouncementBatch } from "@/services/course-announcements/service";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const body: unknown = await request.json().catch(() => null);
    const parsed = courseAnnouncementBatchSchema.safeParse(body);
    if (!parsed.success) return apiError("请检查批次参数", 400);
    return apiSuccess(
      await duplicateCourseAnnouncementBatch(
        teacher.id,
        parsed.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}
