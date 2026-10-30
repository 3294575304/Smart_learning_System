import { Role } from "@prisma/client";

import { announcementApiError } from "@/lib/announcement-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  courseAnnouncementIdSchema,
  courseAnnouncementUpdateSchema,
} from "@/services/course-announcements/schemas";
import {
  deleteCourseAnnouncement,
  updateCourseAnnouncement,
} from "@/services/course-announcements/service";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

interface Context {
  params: Promise<{ announcementId: string }>;
}

export async function PATCH(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const id = courseAnnouncementIdSchema.safeParse(
      (await context.params).announcementId,
    );
    if (!id.success) return apiError("通知 ID 格式无效", 400);
    const body: unknown = await request.json().catch(() => null);
    const parsed = courseAnnouncementUpdateSchema.safeParse(body);
    if (!parsed.success) return apiError("通知内容不符合要求", 422);
    return apiSuccess(
      await updateCourseAnnouncement(
        teacher.id,
        id.data,
        parsed.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const id = courseAnnouncementIdSchema.safeParse(
      (await context.params).announcementId,
    );
    if (!id.success) return apiError("通知 ID 格式无效", 400);
    return apiSuccess(
      await deleteCourseAnnouncement(
        teacher.id,
        id.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}
