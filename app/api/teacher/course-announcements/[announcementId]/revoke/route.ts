import { Role } from "@prisma/client";

import { announcementApiError } from "@/lib/announcement-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { courseAnnouncementIdSchema } from "@/services/course-announcements/schemas";
import { revokeCourseAnnouncement } from "@/services/course-announcements/service";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

interface Context {
  params: Promise<{ announcementId: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const id = courseAnnouncementIdSchema.safeParse(
      (await context.params).announcementId,
    );
    if (!id.success) return apiError("通知 ID 格式无效", 400);
    return apiSuccess(
      await revokeCourseAnnouncement(
        teacher.id,
        id.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}
