import { Role } from "@prisma/client";

import { announcementApiError } from "@/lib/announcement-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  courseAnnouncementCreateSchema,
  courseAnnouncementListQuerySchema,
} from "@/services/course-announcements/schemas";
import {
  createCourseAnnouncement,
  listCourseAnnouncements,
} from "@/services/course-announcements/service";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

export async function GET(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = courseAnnouncementListQuerySchema.safeParse(query);
    if (!parsed.success) return apiError("请检查通知筛选条件", 400);
    return apiSuccess(await listCourseAnnouncements(teacher.id, parsed.data));
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const body: unknown = await request.json().catch(() => null);
    const parsed = courseAnnouncementCreateSchema.safeParse(body);
    if (!parsed.success) return apiError("通知内容不符合要求", 422);
    return apiSuccess(
      await createCourseAnnouncement(
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
